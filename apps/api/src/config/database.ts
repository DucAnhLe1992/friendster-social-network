import mongoose from 'mongoose';

const connectDB = async (uri: string): Promise<void> => {
  mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));
  mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));
  await mongoose.connect(uri);
  console.log('MongoDB connected');
};

export default connectDB;
