import dbConnect from '../lib/dbConnect';
import redis from '../lib/redis';
import Loan from '../models/Loan';
import Book from '../models/Book';
import Member from '../models/Member';

const FINE_RATE_PER_DAY = 0.25;
const BOOKS_CACHE_KEY = 'books:all';

// Helper to update a single book inside the full cached list
async function updateBookInCache(bookId, newStatus) {
    try {
        const cachedBooks = await redis.get(BOOKS_CACHE_KEY);
        if (cachedBooks) {
            // Find the book and update its status locally
            const updatedBooks = cachedBooks.map(book => 
                book.id === bookId ? { ...book, status: newStatus } : book
            );
            // Save the updated list back to Redis (keeping the remaining TTL is complex, so we reset to 1 hour)
            await redis.set(BOOKS_CACHE_KEY, updatedBooks, { ex: 3600 });
        }
    } catch (error) {
        console.error("Cache Update Error:", error);
        // If smart update fails, fallback to delete so data stays consistent
        await redis.del(BOOKS_CACHE_KEY);
    }
}

export default async function handler(req, res) {
  const { method } = req;
  const { id, active, unpaid } = req.query;

  await dbConnect();

  switch (method) {
    case 'GET':
      // ... (GET logic remains exactly the same) ...
      try {
        let query = {};
        if (active === 'true') query.returnDate = null;
        if (unpaid === 'true') query.fineStatus = 'Unpaid';
        
        const loans = await Loan.find(query)
          .populate({ path: 'bookId', model: Book })
          .populate({ path: 'memberId', model: Member });
        
        if (active === 'true') {
          const now = new Date();
          const loansWithCurrentFine = loans.map(loan => {
            let currentFine = 0;
            try {
                if (loan.dueDate instanceof Date && !isNaN(loan.dueDate) && now > loan.dueDate) {
                  const diffTime = now.getTime() - loan.dueDate.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  currentFine = diffDays * FINE_RATE_PER_DAY;
                }
            } catch (e) {}
            try {
                const loanObject = loan.toJSON(); 
                loanObject.currentFine = currentFine;
                return loanObject;
            } catch (e) {
                return { ...loan.toObject(), currentFine: 0 };
            }
          });
          return res.status(200).json(loansWithCurrentFine);
        }
        res.status(200).json(loans);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
      break;

    case 'PUT': 
      try {
        const { returnDate, bookId, fineStatus } = req.body;

        // Handle Paying a Fine
        if (fineStatus === 'Paid') {
          const loan = await Loan.findByIdAndUpdate(id, { fineStatus: 'Paid' }, { new: true });
          if (!loan) return res.status(404).json({ success: false, error: 'Loan not found' });
          return res.status(200).json(loan);
        }
        
        // Handle Returning a Book
        if (returnDate) {
          const loan = await Loan.findById(id);
          if (!loan) return res.status(404).json({ success: false, error: 'Loan not found' });

          loan.returnDate = returnDate;

          // Calculate Fine
          if (loan.dueDate) {
             const returnDateTime = new Date(returnDate).getTime();
             const dueDateTime = loan.dueDate.getTime();
             if (returnDateTime > dueDateTime) {
               const diffTime = returnDateTime - dueDateTime;
               const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
               if (diffDays > 0) {
                 loan.fineAmount = diffDays * FINE_RATE_PER_DAY;
                 loan.fineStatus = 'Unpaid';
               }
             }
          }

          await loan.save();
          
          if (bookId) {
              await Book.findByIdAndUpdate(bookId, { status: 'Available' });
              
              // SMART UPDATE: Update cache instead of deleting it
              await updateBookInCache(bookId, 'Available');
          }
          
          return res.status(200).json(loan);
        }
        
        res.status(400).json({ success: false, error: 'Invalid PUT request.' });

      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
      break;

    case 'POST': // Checkout a book
      try {
        const { bookId, memberId, dueDate } = req.body;
        const loan = await Loan.create({ bookId, memberId, dueDate, returnDate: null });
        await Book.findByIdAndUpdate(bookId, { status: 'On Loan' });
        
        // SMART UPDATE: Update cache instead of deleting it
        await updateBookInCache(bookId, 'On Loan');
        
        res.status(201).json(loan);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT']);
      res.status(405).end(`Method ${method} Not Allowed`);
      break;
  }
}