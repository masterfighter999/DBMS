import dbConnect from '../lib/dbConnect';
import redis from '../lib/redis';
import Loan from '../models/Loan';
import Book from '../models/Book';
import Member from '../models/Member';
import { produceEvent } from '../lib/kafka';

const FINE_RATE_PER_DAY = 0.25;
const BOOKS_CACHE_KEY = 'books:all';

// FAIL-SAFE Helper
async function updateBookInCache(bookId, newStatus) {
    // 1. Safety Check: If Redis isn't connected, stop immediately.
    if (!redis) return;

    try {
        const cachedData = await redis.get(BOOKS_CACHE_KEY);
        if (cachedData) {
            const cachedBooks = JSON.parse(cachedData);
            const updatedBooks = cachedBooks.map(book => 
                book.id === bookId ? { ...book, status: newStatus } : book
            );
            await redis.set(BOOKS_CACHE_KEY, JSON.stringify(updatedBooks), 'EX', 3600);
        }
    } catch (error) {
        console.warn("Redis Smart Update Failed (Ignoring):", error.message);
        try { await redis.del(BOOKS_CACHE_KEY); } catch (e) {}
    }
}

export default async function handler(req, res) {
  const { method } = req;
  const { id, active, unpaid } = req.query;

  // 2. Ensure DB Connects First
  try {
    await dbConnect();
  } catch (dbError) {
    console.error("Database Connection Failed:", dbError);
    return res.status(500).json({ success: false, error: "Database Connection Failed" });
  }

  switch (method) {
    case 'GET':
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

        if (fineStatus === 'Paid') {
          const loan = await Loan.findByIdAndUpdate(id, { fineStatus: 'Paid' }, { new: true });
          if (!loan) return res.status(404).json({ success: false, error: 'Loan not found' });
          
          // Use Kafka safely
          try { await produceEvent('FINE_PAID', { loanId: id, amount: loan.fineAmount }); } catch(e) { console.warn("Kafka Error:", e.message); }
          
          return res.status(200).json(loan);
        }
        
        if (returnDate) {
          const loan = await Loan.findById(id);
          if (!loan) return res.status(404).json({ success: false, error: 'Loan not found' });

          loan.returnDate = returnDate;
          let fineCalculated = 0;

          if (loan.dueDate) {
             const returnDateTime = new Date(returnDate).getTime();
             const dueDateTime = loan.dueDate.getTime();
             if (returnDateTime > dueDateTime) {
               const diffTime = returnDateTime - dueDateTime;
               const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
               if (diffDays > 0) {
                 fineCalculated = diffDays * FINE_RATE_PER_DAY;
                 loan.fineAmount = fineCalculated;
                 loan.fineStatus = 'Unpaid';
               }
             }
          }

          await loan.save();
          
          if (bookId) {
              await Book.findByIdAndUpdate(bookId, { status: 'Available' });
              await updateBookInCache(bookId, 'Available');
          }
          
          try { await produceEvent('BOOK_RETURNED', { loanId: id, bookId, fine: fineCalculated }); } catch(e) { console.warn("Kafka Error:", e.message); }

          return res.status(200).json(loan);
        }
        res.status(400).json({ success: false, error: 'Invalid PUT request.' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
      break;

    case 'POST':
      try {
        const { bookId, memberId, dueDate } = req.body;
        const loan = await Loan.create({ bookId, memberId, dueDate, returnDate: null });
        await Book.findByIdAndUpdate(bookId, { status: 'On Loan' });
        
        await updateBookInCache(bookId, 'On Loan');
        
        try { await produceEvent('BOOK_CHECKED_OUT', { loanId: loan._id, bookId, memberId, dueDate }); } catch(e) { console.warn("Kafka Error:", e.message); }

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