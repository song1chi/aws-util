// Lambda Function in Node.js
const AWS = require('aws-sdk');
const ip = require('ip');
const { CidrMatcher } = require('cidr-matcher');
const { S3 } = require('aws-sdk');
const REGION = 'ap-northeast-2'; // 예시: 서울 리전
const BUCKET_NAME = 'your-s3-bucket-name';

const s3 = new AWS.S3({ region: REGION });
const sns = new AWS.SNS({ region: REGION });

exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event));

  try {
    const clientIp = event.requestContext.identity?.sourceIp || event.requestContext.http?.sourceIp;
    const body = JSON.parse(event.body);
    console.log('Parsed body:', body);

    const { user_id, message, phone_numbers = [] } = body;

    if (!user_id || !message || typeof message !== 'string') {
      console.warn('#1 ERR_MISSING_FIELDS: Missing required fields');
      return respond(400, 'invalid request #1');
    }
    if (!/^[0-9]{8,12}$/.test(user_id)) {
      console.warn('#2 ERR_INVALID_USER_ID: Invalid user_id format');
      return respond(400, 'invalid request #2');
    }
    if (Buffer.byteLength(message, 'utf8') > 80) {
      console.warn('#3 ERR_MESSAGE_TOO_LONG: Message exceeds 80 bytes');
      return respond(400, 'invalid request #3');
    }
    if (phone_numbers.some(p => !(p.startsWith('+8210') || p.startsWith('+82010')))) {
      console.warn('#4 ERR_INVALID_PHONE_NUMBER: Invalid phone number format');
      return respond(400, 'invalid request #4');
    }

    const user = await getUserData(user_id);
    if (!user) {
      console.warn('#5 ERR_USER_NOT_FOUND: User not registered');
      return respond(400, 'invalid request #5');
    }

    console.log('Loaded user data:', user);

    const matcher = new CidrMatcher(user.allowed_ips);
    if (!matcher.contains(clientIp)) {
      console.warn(`#6 ERR_UNAUTHORIZED_IP: Unauthorized IP address: ${clientIp}`);
      return respond(418, 'invalid request #6');
    }

    const recipients = phone_numbers.length > 0 ? phone_numbers : (user.phone_numbers || []);
    if (recipients.length === 0) {
      console.warn('#7 ERR_NO_PHONE_NUMBERS: No valid phone numbers to send to');
      return respond(400, 'invalid request #7');
    }

    const messageWithPrefix = `[Navi.AI] ${message}`;

    for (const number of recipients) {
      console.log(`Sending message to ${number}`);
      await sns.publish({ PhoneNumber: number, Message: messageWithPrefix }).promise();
    }

    console.log('Message sent successfully');
    return respond(200, 'success #0');
  } catch (err) {
    console.error('#999 ERR_INTERNAL:', err);
    return respond(500, 'server error #999');
  }
};

async function getUserData(user_id) {
  try {
    const result = await s3.getObject({ Bucket: BUCKET_NAME, Key: `${user_id}.json` }).promise();
    return JSON.parse(result.Body.toString());
  } catch (err) {
    if (err.code === 'NoSuchKey') {
      console.warn(`#5 ERR_USER_NOT_FOUND: User data not found for user_id: ${user_id}`);
      return null;
    }
    throw err;
  }
}

function respond(statusCode, message) {
  console.log(`Responding with status ${statusCode}: ${message}`);
  return {
    statusCode,
    body: JSON.stringify({ code: message }),
  };
}
