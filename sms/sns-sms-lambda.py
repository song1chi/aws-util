# Lambda Function in Python
import json
import boto3
import ipaddress

REGION_NAME = 'ap-northeast-2'  # 예시: 서울 리전
s3 = boto3.client('s3', region_name=REGION_NAME)
sns = boto3.client('sns', region_name=REGION_NAME)

BUCKET_NAME = 'your-s3-bucket-name'


def lambda_handler(event, context):
    print("Received event:", json.dumps(event))

    try:
        request_context = event.get('requestContext', {})
        client_ip = request_context.get('identity', {}).get('sourceIp') or request_context.get('http', {}).get('sourceIp')

        body = json.loads(event['body'])
        print("Parsed body:", body)

        user_id = body.get('user_id')
        message = body.get('message')
        phone_numbers = body.get('phone_numbers', [])

        if not (user_id and message) or not user_id.isdigit() or not (8 <= len(user_id) <= 12):
            print("#1 ERR_INVALID_USER_ID: Invalid or missing user_id or message")
            return respond(400, 'invalid request #1')
        if len(message.encode('utf-8')) > 80:
            print("#2 ERR_MESSAGE_TOO_LONG: Message exceeds 80 bytes")
            return respond(400, 'invalid request #2')
        if phone_numbers:
            for pn in phone_numbers:
                if not (pn.startswith('+8210') or pn.startswith('+82010')):
                    print(f"#3 ERR_INVALID_PHONE_NUMBER: Invalid phone number {pn}")
                    return respond(400, 'invalid request #3')

        user_data = get_user_data(user_id)
        if user_data is None:
            print("#4 ERR_USER_NOT_FOUND: User not registered")
            return respond(400, 'invalid request #4')

        print("User data loaded:", user_data)

        if not any(ipaddress.ip_address(client_ip) in ipaddress.ip_network(cidr) for cidr in user_data['allowed_ips']):
            print(f"#5 ERR_UNAUTHORIZED_IP: Unauthorized IP {client_ip}")
            return respond(418, 'invalid request #5')

        recipients = phone_numbers if phone_numbers else user_data.get('phone_numbers', [])
        if not recipients:
            print("#6 ERR_NO_PHONE_NUMBERS: No valid phone numbers to send to")
            return respond(400, 'invalid request #6')

        message_with_prefix = f"[Navi.AI] {message}"
        for number in recipients:
            print(f"Sending message to {number}")
            sns.publish(PhoneNumber=number, Message=message_with_prefix)

        print("Message sent successfully")
        return respond(200, 'success #0')

    except Exception as e:
        print("#999 ERR_INTERNAL:", str(e))
        return respond(500, 'server error #999')


def get_user_data(user_id):
    try:
        response = s3.get_object(Bucket=BUCKET_NAME, Key=f'{user_id}.json')
        return json.loads(response['Body'].read().decode('utf-8'))
    except s3.exceptions.NoSuchKey:
        print(f"#4 ERR_USER_NOT_FOUND: User data not found for {user_id}")
        return None
    except Exception as e:
        raise e


def respond(code, message):
    print(f"Responding with status {code}: {message}")
    return {
        'statusCode': code,
        'body': json.dumps({ 'code': message })
    }
