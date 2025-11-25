import dbConnect from '../lib/dbConnect';
import Loan from '../models/Loan';
import Book from '../models/Book';
import Member from '../models/Member';

// Define the fine rate (e.g., $0.25 per day)
const FINE_RATE_PER_DAY = 0.25;

export default async function handler(req, res) {
  const { method } = req;
  const { id, active, unpaid } = req.query;

  await dbConnect();

  switch (method) {
    case 'GET':
      try {
        let query = {};
        if (active === 'true') {
          query.returnDate = null;
        }
        if (unpaid === 'true') {
          query.fineStatus = 'Unpaid';
        }
        
        const loans = await Loan.find(query)
          .populate({ path: 'bookId', model: Book })
          .populate({ path: 'memberId', model: Member });
        
        // --- Calculate Current Fine for Active Overdue Loans ---
        if (active === 'true') {
          const now = new Date();
          const loansWithCurrentFine = loans.map(loan => {
            let currentFine = 0;
            if (now > loan.dueDate) {
              const diffTime = now.getTime() - loan.dueDate.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              currentFine = diffDays * FINE_RATE_PER_DAY;
            }
            // Use .toObject() to be able to add a virtual property
            const loanObject = loan.toObject(); 
            loanObject.currentFine = currentFine;
            return loanObject;
          });
          return res.status(200).json(loansWithCurrentFine);
        }
        // --- End of Current Fine Calculation ---
          
        res.status(200).json(loans);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'PUT': // Return a book OR Pay a fine
      try {
        const { returnDate, bookId, fineStatus } = req.body;

        // --- Handle Paying a Fine ---
        if (fineStatus === 'Paid') {
          const loan = await Loan.findByIdAndUpdate(id, { fineStatus: 'Paid' }, { new: true });
          if (!loan) {
            return res.status(404).json({ success: false, error: 'Loan not found' });
          }
          return res.status(200).json(loan);
        }
        
        // --- Handle Returning a Book ---
        if (returnDate) {
          const loan = await Loan.findById(id);
          if (!loan) {
            return res.status(404).json({ success: false, error: 'Loan not found' });
          }

          loan.returnDate = returnDate;

          // --- Calculate and Set Final Fine ---
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
          // --- End of Fine Calculation ---

          await loan.save();
          
          // Update the book's status back to 'Available'
          if (bookId) {
              await Book.findByIdAndUpdate(bookId, { status: 'Available' });
          }
          
          return res.status(200).json(loan);
        }
        
        // If no valid action
        res.status(400).json({ success: false, error: 'Invalid PUT request. Provide returnDate or fineStatus.' });

      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'POST': // Checkout a book
      try {
        const { bookId, memberId, dueDate } = req.body;
        
        // 1. Create the loan
        const loan = await Loan.create({ bookId, memberId, dueDate, returnDate: null });
        
        // 2. Update the book's status to 'On Loan'
        await Book.findByIdAndUpdate(bookId, { status: 'On Loan' });
        
        res.status(201).json(loan);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT']);
      res.status(405).end(`Method ${method} Not Allowed`);
      break;
  }
}