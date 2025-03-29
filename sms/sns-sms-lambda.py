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
        # 1. Extract client IP and request body
        client_ip = event['requestContext']['identity']['sourceIp']
        body = json.loads(event['body'])
        print("Parsed body:", body)

        # 2. Validate input JSON structure
        user_id = body.get('user_id')
        message = body.get('message')
        phone_numbers = body.get('phone_numbers', [])

        if not (user_id and message) or not user_id.isdigit() or not (8 <= len(user_id) <= 12):
            print("Validation failed: invalid user_id")
            # hide info: Invalid user_id format => invalid request format #1
            return respond(400, 'Invalid request format #1.')
        if len(message.encode('utf-8')) > 80:
            print("Validation failed: message too long")
            # hide info: Message exceeds 80 bytes => invalid request format #2
            return respond(400, 'Invalid request format #2')
        if phone_numbers:
            for pn in phone_numbers:
                if not (pn.startswith('+8210') or pn.startswith('+82010')):
                    print("Validation failed: invalid phone number", pn)
                    # hide info: Invalid phone number format => invalid request format #3
                    return respond(400, 'invalid request format #3.')

        # 3. Fetch user info from S3
        user_obj = s3.get_object(Bucket=BUCKET_NAME, Key=f'{user_id}.json')
        user_data = json.loads(user_obj['Body'].read())
        print("User data loaded:", user_data)

        # 4. Verify IP address
        allowed = any(ipaddress.ip_address(client_ip) in ipaddress.ip_network(cidr) for cidr in user_data['allowed_ips'])
        if not allowed:
             print(f"Unauthorized IP: {client_ip}")
             # hide info: IP address not authorized => I'm a tea pot
             return respond(418, 'I am a tea pot.')

        # 5. Determine recipients
        recipients = phone_numbers if phone_numbers else user_data.get('phone_numbers', [])
        if not recipients:
            print("No phone numbers provided")
            # hide info: No valid phone numbers to send to => invalid request format #4
            return respond(400, 'invalid request format #4.')

        # 6. Send SMS via SNS
        message_with_prefix = f"[Navi.AI] {message}"
        for number in recipients:
            print(f"Sending message to {number}")
            sns.publish(PhoneNumber=number, Message=message_with_prefix)

        print("Message sent successfully")
        return respond(200, 'Message sent successfully.')

    except Exception as e:
        print("Unhandled exception:", str(e))
        return respond(500, f'Error: {str(e)}')


def respond(code, message):
    print(f"Responding with status {code}: {message}")
    return {
        'statusCode': code,
        'body': json.dumps({ 'message': message })
    }
