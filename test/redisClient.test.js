/* eslint-disable no-undef */
/* eslint-disable no-unused-expressions */
/* eslint-disable jest/valid-expect */
const chai = require('chai');
const chaiHttp = require('chai-http');
const redisClient = require('../utils/redis');

chai.use(chaiHttp);
const { expect } = chai;

describe('redis Client', () => {
  before(async () => {
    await redisClient.connect();
  });

  after(async () => {
    await redisClient.client.quit();
  });

  describe('isAlive', () => {
    it('should return true if the Redis client is connected', () => {
      expect.assertions(1);
      const alive = redisClient.isAlive();
      expect(alive).to.be.true;
    });
  });

  describe('get', () => {
    it('should get a value from Redis', async () => {
      expect.assertions(1);
      await redisClient.set('test_key', 'test_value', 60);
      const value = await redisClient.get('test_key');
      expect(value).to.equal('test_value');
    });
  });

  describe('set', () => {
    it('should set a value in Redis', async () => {
      expect.assertions(1);
      await redisClient.set('test_key', 'test_value', 60);
      const value = await redisClient.get('test_key');
      expect(value).to.equal('test_value');
    });
  });

  describe('del', () => {
    it('should delete a value from Redis', async () => {
      expect.assertions(1);
      await redisClient.set('test_key', 'test_value', 60);
      await redisClient.del('test_key');
      const value = await redisClient.get('test_key');
      expect(value).to.be.null;
    });
  });
});
