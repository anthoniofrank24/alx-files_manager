/* eslint-disable no-undef */
/* eslint-disable no-unused-expressions */
/* eslint-disable jest/valid-expect */
/* eslint-disable jest/prefer-expect-assertions */
const { expect } = require('chai');
const dbClient = require('../utils/db');

describe('database Client', () => {
  before(async () => {
    await dbClient.connect();
  });

  after(async () => {
    await dbClient.client.close();
  });

  describe('isAlive', () => {
    it('should return true if the MongoDB client is connected', () => {
      expect(dbClient.isAlive()).to.be.true;
    });
  });

  describe('nbUsers', () => {
    it('should return the number of users in the database', async () => {
      const nbUsers = await dbClient.nbUsers();
      expect(nbUsers).to.be.a('number');
    });
  });

  describe('nbFiles', () => {
    it('should return the number of files in the database', async () => {
      const nbFiles = await dbClient.nbFiles();
      expect(nbFiles).to.be.a('number');
    });
  });
});
