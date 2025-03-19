import { NextResponse } from "next/server";
import { createEnrollment } from "@/sanity/lib/courses/createEnrollment";
import { getStudentByClerkId } from "@/sanity/lib/student/getStudentByClerkId";

// Define Mpesa Webhook Types
interface MpesaCallbackMetadataItem {
  Name: string;
  Value: string | number;
}

interface MpesaCallbackMetadata {
  Item: MpesaCallbackMetadataItem[];
}

interface MpesaStkCallback {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  CallbackMetadata?: MpesaCallbackMetadata;
}

interface MpesaWebhookPayload {
  Body: {
    stkCallback: MpesaStkCallback;
  };
}

/**
 * Handles incoming Mpesa payment confirmation (webhook).
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    // Parse the incoming request body
    const body: MpesaWebhookPayload = await req.json();
    const { stkCallback } = body.Body;

    // Log the full payload for debugging
    console.log("Mpesa Webhook Payload:", JSON.stringify(body, null, 2));

    if (!stkCallback) {
      console.error("Invalid Mpesa webhook payload:", body);
      return new NextResponse("Invalid payload", { status: 400 });
    }

    const { MerchantRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    // Check if the payment was successful
    if (ResultCode !== 0) {
      console.error(`Mpesa payment failed: ${ResultDesc}`);
      console.error(`MerchantRequestID: ${MerchantRequestID}, ResultCode: ${ResultCode}`);
      return new NextResponse(`Payment failed: ${ResultDesc}`, { status: 400 });
    }

    if (!CallbackMetadata?.Item) {
      console.error("Missing metadata in Mpesa webhook payload");
      return new NextResponse("Missing metadata", { status: 400 });
    }

    // Extract payment details from the metadata
    const metadata = CallbackMetadata.Item;
    const amount = metadata.find((item) => item.Name === "Amount")?.Value as number;
    const phoneNumber = metadata.find((item) => item.Name === "PhoneNumber")?.Value as string;
    const transactionId = metadata.find((item) => item.Name === "TransactionID")?.Value as string;

    if (!amount || !phoneNumber || !transactionId) {
      console.error("Incomplete metadata in Mpesa webhook payload:", metadata);
      return new NextResponse("Incomplete metadata", { status: 400 });
    }

    // Extract courseId and userId from MerchantRequestID
    const [courseId, userId] = MerchantRequestID.split("-");

    if (!courseId || !userId) {
      console.error(`Invalid MerchantRequestID format: ${MerchantRequestID}`);
      return new NextResponse("Invalid MerchantRequestID", { status: 400 });
    }

    // Fetch the student by their Clerk ID
    const student = await getStudentByClerkId(userId);

    if (!student) {
      console.error(`Student not found for userId: ${userId}`);
      return new NextResponse("Student not found", { status: 400 });
    }

    // Create an enrollment record in Sanity
    try {
      await createEnrollment({
        studentId: student._id,
        courseId,
        paymentId: transactionId,
        amount,
      });

      console.log("Enrollment created successfully:", {
        studentId: student._id,
        courseId,
        paymentId: transactionId,
        amount,
      });

      console.log(`Student ${student.email} now has access to course ${courseId}.`);
    } catch (dbError: any) {
      console.error("Failed to create enrollment in Sanity:", dbError.message);
      return new NextResponse("Failed to create enrollment", { status: 500 });
    }

    // Respond to Mpesa with a success status
    return new NextResponse(null, { status: 200 });
  } catch (error: any) {
    console.error("Error in Mpesa webhook handler:", error.message);
    return new NextResponse("Webhook handler failed", { status: 500 });
  }
}