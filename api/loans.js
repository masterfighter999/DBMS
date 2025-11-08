import dbConnect from '../lib/dbConnect';
import Loan from '../models/Loan';
import Book from '../models/Book';
import Member from '../models/Member';

export default async function handler(req, res) {
  const { method } = req;
  const { id, active } = req.query;

  await dbConnect();

  switch (method) {
    case 'GET':
      try {
        let query = {};
        if (active === 'true') {
          query.returnDate = null;
        }
        // Populate 'book' and 'member' details from their respective collections
        const loans = await Loan.find(query)
          .populate({ path: 'bookId', model: Book })
          .populate({ path: 'memberId', model: Member });
          
        res.status(200).json(loans);
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

    case 'PUT': // Return a book
      try {
        const { returnDate, bookId } = req.body;
        
        // 1. Update the loan
        const loan = await Loan.findByIdAndUpdate(id, { returnDate }, { new: true });
        if (!loan) {
          return res.status(404).json({ success: false, error: 'Loan not found' });
        }
        
        // 2. Update the book's status back to 'Available'
        if (bookId) {
            await Book.findByIdAndUpdate(bookId, { status: 'Available' });
        }
        
        res.status(200).json(loan);
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