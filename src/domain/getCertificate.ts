import { S3, AWSError } from 'aws-sdk';
import { APIGatewayProxyResult } from 'aws-lambda';
import CertificateDetails from '../interfaces/CertificateDetails';
import getObjectFromS3 from '../infrastructure/s3/s3Service';
import encode from '../utils/encodingService';
import validate from '../utils/validationService';
import NoBodyError from '../errors/NoBodyError';
import CertificateNumberError from '../errors/CertificateNumberError';
import VinError from '../errors/VinError';
import MissingBucketNameError from '../errors/MissingBucketNameError';
import IncorrectFileTypeError from '../errors/IncorrectFileTypeError';

function isAWSError(error: Error | AWSError): error is AWSError {
  return Object.prototype.hasOwnProperty.call(error, 'code') as boolean;
}

export default async (
  event: CertificateDetails,
  s3: S3,
  bucketName: string | undefined,
): Promise<APIGatewayProxyResult> => {
  try {
    if (!bucketName) {
      throw new MissingBucketNameError();
    }

    validate(event);

    const file = await getObjectFromS3(s3, bucketName, event.testNumber, event.vin);
    const response = encode(file);

    return {
      headers: { 'Content-Type': 'application/pdf' },
      statusCode: 200,
      body: response,
      isBase64Encoded: true,
    };
  } catch (e) {
    let code = 500;
    let message = '';

    // Split into 50x and 40x errors.
    if (e instanceof NoBodyError || e instanceof MissingBucketNameError) {
      message = e.message;
    }

    if (e instanceof VinError || e instanceof CertificateNumberError) {
      code = 400;
      message = e.message;
    }

    if (e instanceof IncorrectFileTypeError) {
      code = 404;
      message = e.message;
    }

    if (isAWSError(e)) {
      // S3 error that the key does not exist
      if (['NoSuchKey'].includes(e.code)) {
        code = 404;
      }

      // Any other AWS errors we get will always be a 500 because it will be an error on our part.
      message = e.code;
    }

    console.error(code);
    console.error(message);

    return {
      statusCode: code,
      body: message,
    };
  }
};