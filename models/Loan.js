import mongoose from 'mongoose';

const LoanSchema = new mongoose.Schema({
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    required: true,
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true,
  },
  checkoutDate: {
    type: Date,
    default: Date.now,
  },
  dueDate: {
    type: Date,
    required: true,
  },
  returnDate: {
    type: Date,
    default: null, // null indicates the loan is active
  },
});

// Virtual for 'id'
LoanSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// Rename 'memberId' and 'bookId' to 'member' and 'book' when populating
LoanSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.member = ret.memberId;
    ret.book = ret.bookId;
    delete ret.memberId;
    delete ret.bookId;
    delete ret._id;
    delete ret.__v;
  }
});

export default mongoose.models.Loan || mongoose.model('Loan', LoanSchema);