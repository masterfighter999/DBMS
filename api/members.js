import dbConnect from '../lib/dbConnect';
import Member from '../models/Member';
import Loan from '../models/Loan';

export default async function handler(req, res) {
  const { method } = req;
  const { id } = req.query;

  await dbConnect();

  switch (method) {
    case 'GET':
      try {
        const members = await Member.find({});
        res.status(200).json(members);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'POST':
      try {
        const member = await Member.create(req.body);
        res.status(201).json(member);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'PUT':
      try {
        const member = await Member.findByIdAndUpdate(id, req.body, {
          new: true,
          runValidators: true,
        });
        if (!member) {
          return res.status(404).json({ success: false, error: 'Member not found' });
        }
        res.status(200).json(member);
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
      break;

    case 'DELETE':
      try {
        // Check for active loans
        const activeLoan = await Loan.findOne({ memberId: id, returnDate: null });
        if (activeLoan) {
            return res.status(400).json({ success: false, error: 'Cannot delete member with active loans.' });
        }
        
        const deletedMember = await Member.deleteOne({ _id: id });
        if (!deletedMember.deletedCount) {
          return res.status(404).json({ success: false, error: 'Member not found' });
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