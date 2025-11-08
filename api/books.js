import dbConnect from '../lib/dbConnect';
import Book from '../models/Book';

export default async function handler(req, res) {
  const { method } = req;
  const { id } = req.query;

  await dbConnect();

  switch (method) {
    case 'GET':
      try {
        const books = await Book.find({});
        res.status(200).json(books);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'POST':
      try {
        const book = await Book.create(req.body);
        res.status(201).json(book);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'PUT':
      try {
        const book = await Book.findByIdAndUpdate(id, req.body, {
          new: true,
          runValidators: true,
        });
        if (!book) {
          return res.status(404).json({ success: false, error: 'Book not found' });
        }
        res.status(200).json(book);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'DELETE':
      try {
        const deletedBook = await Book.deleteOne({ _id: id });
        if (!deletedBook.deletedCount) {
          return res.status(404).json({ success: false, error: 'Book not found' });
        }
        res.status(200).json({ success: true });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
      break;
  }
}