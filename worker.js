/* eslint-disable consistent-return */
/* eslint-disable no-await-in-loop */
const { ObjectId } = require('mongodb');
const imageThumbnail = require('image-thumbnail');
const fs = require('fs').promises;
const dbClient = require('./utils/db');
const { fileQueue, userQueue } = require('./queues/fileQueue');

fileQueue.process(async (job) => {
  const { fileId, userId } = job.data;

  if (!fileId) throw new Error('Missing fileId');
  if (!userId) throw new Error('Missing userId');

  const file = await dbClient.db.collection('files').findOne({
    _id: new ObjectId(fileId),
    userId: new ObjectId(userId),
  });

  if (!file) throw new Error('File not found');
  const sizes = [500, 250, 100];
  const options = (width) => ({ width });

  for (const size of sizes) {
    const thumbnail = await imageThumbnail(file.localPath, options(size));
    const thumbnailPath = `${file.localPath}_${size}`;

    await fs.writeFile(thumbnailPath, thumbnail);
  }
});

fileQueue.on('error', (error) => {
  console.error('File queue error:', error);
});

userQueue.process(async (job, done) => {
  const { userId } = job.data;

  if (!userId) {
    return done(new Error('Missing userId'));
  }

  try {
    const user = await dbClient.db.collection('users').findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return done(new Error('User not found'));
    }

    console.log(`Welcome ${user.email}!`);
    done();
  } catch (error) {
    done(error);
  }
});

userQueue.on('error', (error) => {
  console.error('User queue error:', error);
});
