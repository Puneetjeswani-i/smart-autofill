/**
 * Forgot the shop PIN?  Run:   npm run reset-pin   (inside the backend folder)
 * The PIN is removed and you can set a new one when you next open the app.
 * Customer data is NOT deleted (it is protected by the master key, not the PIN).
 * Stop the running server first.
 */

'use strict';

const { bootstrap } = require('../server');
const auth = require('../services/authService');
const db = require('../db');

bootstrap();
auth.resetPin();
db.close();
console.log('PIN removed. Start the app and set a new PIN on the login screen.');
