// Lambda Function in Node.js
const AWS = require('aws-sdk');
const ip = require('ip');
const { CidrMatcher } = require('cidr-matcher');

const REGION = 'ap-northeast-2'; // 예시: 서울 리전
const BUCKET_NAME = 'your-s3-bucket-name';

const s3 = new AWS.S3({ region: REGION });
const sns = new AWS.SNS({ region: REGION });

exports.handler = async (event) => {
  try {
    const clientIp = event.requestContext.identity.sourceIp;
    const body = JSON.parse(event.body);

    const { user_id, message, phone_numbers = [] } = body;

    if (!user_id || !message || typeof message !== 'string') {
      return respond(400, 'Missing required fields.');
    }
    if (!/^[0-9]{8,12}$/.test(user_id)) {
      return respond(400, 'Invalid user_id format.');
    }
    if (Buffer.byteLength(message, 'utf8') > 80) {
      return respond(400, 'Message exceeds 80 bytes.');
    }
    if (phone_numbers.some(p => !p.startsWith('+8210'))) {
      return respond(400, 'Invalid phone number format.');
    }

    const userData = await s3.getObject({ Bucket: BUCKET_NAME, Key: `${user_id}.json` }).promise();
    const user = JSON.parse(userData.Body.toString());

    const matcher = new CidrMatcher(user.allowed_ips);
    if (!matcher.contains(clientIp)) {
      return respond(418, 'IP address not authorized.');
    }

    const recipients = phone_numbers.length > 0 ? phone_numbers : (user.phone_numbers || []);
    if (recipients.length === 0) {
      return respond(400, 'No valid phone numbers to send to.');
    }

    const messageWithPrefix = `[Navi.AI] ${message}`;

    for (const number of recipients) {
      await sns.publish({ PhoneNumber: number, Message: messageWithPrefix }).promise();
    }

    return respond(200, 'Message sent successfully.');
  } catch (err) {
    console.error(err);
    return respond(500, `Internal server error: ${err.message}`);
  }
};

function respond(statusCode, message) {
  return {
    statusCode,
    body: JSON.stringify({ message }),
  };
}
