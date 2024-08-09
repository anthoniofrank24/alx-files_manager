const redis = require('redis');
const { promisify } = require('util');

class RedisClient {
  constructor() {
    this.client = redis.createClient();
    this.client.on('error', (err) => console.error('Redis Client Error', err));
    this.client.get = promisify(this.client.get);
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    return this.client.get(key);
  }

  async set(key, value, duration) {
    this.client.set(key, value, 'EX', duration);
  }

  async del(key) {
    this.client.del(key);
  }

  ping(callback) {
    this.client.ping(callback);
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
