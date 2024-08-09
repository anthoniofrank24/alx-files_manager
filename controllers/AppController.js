const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

const checkRedisAlive = () => new Promise((resolve) => {
  redisClient.ping((err, result) => {
    resolve(result === 'PONG');
  });
});

const AppController = {
  async getStatus(req, res) {
    try {
      const [dbAlive, redisAlive] = await Promise.all([
        dbClient.isAlive(),
        checkRedisAlive(),
      ]);

      res.status(200).json({
        redis: redisAlive,
        db: dbAlive,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  async getStats(req, res) {
    try {
      const [usersCount, filesCount] = await Promise.all([
        dbClient.nbUsers(),
        dbClient.nbFiles(),
      ]);

      res.status(200).json({
        users: usersCount,
        files: filesCount,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },
};

module.exports = AppController;
