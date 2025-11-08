import mongoose from 'mongoose';

const BookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a title.'],
  },
  author: {
    type: String,
    required: [true, 'Please provide an author.'],
  },
  isbn: {
    type: String,
    required: [true, 'Please provide an ISBN.'],
    unique: true,
  },
  category: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Available', 'On Loan'],
    default: 'Available',
  },
});

// Virtual for 'id' to match client-side expectations (which used Firestore doc.id)
BookSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

BookSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
  }
});

export default mongoose.models.Book || mongoose.model('Book', BookSchema);