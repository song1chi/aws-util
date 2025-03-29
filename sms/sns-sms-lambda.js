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
      # hide info: Missing required fields => invalid request format #0
      return respond(400, 'invalid request format #0.');
    }
    if (!/^[0-9]{8,12}$/.test(user_id)) {
      # hide info: Invalid user_id format => invalid request format #1
      return respond(400, 'Invalid user_id format #1.');
    }
    if (Buffer.byteLength(message, 'utf8') > 80) {
      # hide info: Message exceeds 80 bytes => invalid request format #2
      return respond(400, 'invalid request format #2.');
    }
    if (phone_numbers.some(p => !p.startsWith('+8210'))) {
      # hide info: Invalid phone number format => invalid request format #3
      return respond(400, 'invalid request format #3.');
    }

    const userData = await s3.getObject({ Bucket: BUCKET_NAME, Key: `${user_id}.json` }).promise();
    const user = JSON.parse(userData.Body.toString());

    const matcher = new CidrMatcher(user.allowed_ips);
    if (!matcher.contains(clientIp)) {
      # hide info: IP address not authorized => I'm a tea pot
      return respond(418, 'I am a tea pot.');
    }

    const recipients = phone_numbers.length > 0 ? phone_numbers : (user.phone_numbers || []);
    if (recipients.length === 0) {
      # hide info: No valid phone numbers to send to => invalid request format #4
      return respond(400, 'invalid request format #4.');
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
