#!/usr/bin/env node
/* eslint-disable import/no-extraneous-dependencies */

const express = require('express');
const bodyParser = require('body-parser');
const routes = require('./routes/index');

const app = express();
const port = process.env.PORT || 5000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/', routes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
