import dbConnect from '../lib/dbConnect';
import redis from '../lib/redis';
import Book from '../models/Book';

const CACHE_KEY = 'books:all';
const CACHE_TTL = 3600; // Cache for 1 hour (in seconds)

export default async function handler(req, res) {
  const { method } = req;
  const { id } = req.query;

  await dbConnect();

  switch (method) {
    case 'GET':
      try {
        // 1. Try to fetch from Cache
        const cachedBooks = await redis.get(CACHE_KEY);
        
        if (cachedBooks) {
          // HIT: Return cached data
          // (We set a custom header so you can see it in Network tab)
          res.setHeader('X-Cache', 'HIT');
          return res.status(200).json(cachedBooks);
        }

        // 2. MISS: Fetch from MongoDB
        const books = await Book.find({});
        
        // 3. Save to Cache (Background operation, don't await to speed up response)
        // We store the raw JSON result
        redis.set(CACHE_KEY, books, { ex: CACHE_TTL }).catch(err => console.error("Redis Error:", err));

        res.setHeader('X-Cache', 'MISS');
        res.status(200).json(books);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'POST':
      try {
        const book = await Book.create(req.body);
        
        // Invalidate Cache on Change
        await redis.del(CACHE_KEY);
        
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
        
        // Invalidate Cache on Change
        await redis.del(CACHE_KEY);

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
        
        // Invalidate Cache on Change
        await redis.del(CACHE_KEY);

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