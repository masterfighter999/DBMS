import dbConnect from '../lib/dbConnect';
import redis from '../lib/redis';
import Book from '../models/Book';
import { produceEvent } from '../lib/kafka';

const CACHE_KEY = 'books:all';
const CACHE_TTL = 3600;

export default async function handler(req, res) {
  const { method } = req;
  const { id } = req.query;

  await dbConnect();

  switch (method) {
    case 'GET':
      try {
        // 1. Try Redis (Fail-Safe)
        try {
            const cachedData = await redis.get(CACHE_KEY);
            if (cachedData) {
                res.setHeader('X-Cache', 'HIT');
                return res.status(200).json(JSON.parse(cachedData));
            }
        } catch (redisError) {
            // Redis failed? No problem. Log it and move on to MongoDB.
            console.warn("Redis Unavailable (Read):", redisError.message);
        }

        // 2. Fetch from MongoDB (The Backup/Source of Truth)
        const books = await Book.find({});
        
        // 3. Update Redis (Fail-Safe)
        try {
            await redis.set(CACHE_KEY, JSON.stringify(books), 'EX', CACHE_TTL);
        } catch (redisError) {
            console.warn("Redis Unavailable (Write):", redisError.message);
        }

        res.setHeader('X-Cache', 'MISS');
        res.status(200).json(books);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
      break;

    case 'POST':
      try {
        const book = await Book.create(req.body);
        
        // Fail-Safe Cache Invalidation
        try { await redis.del(CACHE_KEY); } catch (e) { console.warn("Redis Del Failed:", e.message); }
        
        produceEvent('BOOK_ADDED', { bookId: book._id, title: book.title });
        res.status(201).json(book);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'PUT':
      try {
        const book = await Book.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
        
        // Fail-Safe Cache Invalidation
        try { await redis.del(CACHE_KEY); } catch (e) { console.warn("Redis Del Failed:", e.message); }
        
        res.status(200).json(book);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'DELETE':
      try {
        const deletedBook = await Book.deleteOne({ _id: id });
        if (!deletedBook.deletedCount) return res.status(404).json({ success: false, error: 'Book not found' });
        
        // Fail-Safe Cache Invalidation
        try { await redis.del(CACHE_KEY); } catch (e) { console.warn("Redis Del Failed:", e.message); }
        
        produceEvent('BOOK_DELETED', { bookId: id });
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