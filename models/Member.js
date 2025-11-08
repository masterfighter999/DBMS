import mongoose from 'mongoose';

const MemberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name.'],
    uppercase: true,
  },
  city: {
    type: String,
    required: [true, 'Please provide a city.'],
  },
  status: {
    type: String,
    enum: ['A', 'S'], // A = Active, S = Suspended
    default: 'A',
  },
  joinDate: {
    type: Date,
    default: Date.now,
  },
});

// Virtual for 'id'
MemberSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

MemberSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
  }
});

export default mongoose.models.Member || mongoose.model('Member', MemberSchema);