/* eslint-disable no-unused-expressions */
/* eslint-disable jest/valid-expect */
/* eslint-disable jest/no-hooks */
const chai = require('chai');
const chaiHttp = require('chai-http');
const sinon = require('sinon');
const app = require('../server');
const { userQueue } = require('../queues/fileQueue');

chai.use(chaiHttp);
const { expect } = chai;

describe('users Controller', () => {
  describe('pOST /users', () => {
    beforeEach(() => {
      sinon.stub(userQueue, 'add').resolves();
    });

    afterEach(() => {
      userQueue.add.restore();
    });

    it('should create a user and add a job to the userQueue', () => new Promise((done) => {
      chai.request(app)
        .post('/users')
        .send({ email: 'test@example.com', password: 'password123' })
        .end((err, res) => {
          expect(res).to.have.status(201);
          expect(res.body).to.have.property('id');
          expect(res.body).to.have.property('email', 'test@example.com');
          expect(userQueue.add.calledOnce).to.be.true;
          done();
        });
    }));
  });
});
