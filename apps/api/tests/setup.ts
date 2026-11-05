import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';

let memoryServer: MongoMemoryServer | null = null;

beforeAll(async () => {
  // CI provides a real MongoDB service; locally an in-memory server is started instead.
  let uri = process.env.MONGODB_URI_TEST;
  if (!uri) {
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
  }
  await mongoose.connect(uri, { dbName: `friendster_test_${process.pid}_${Date.now()}` });
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

beforeEach(async () => {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await memoryServer?.stop();
});
