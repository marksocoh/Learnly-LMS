"use server";

import axios from "axios";
import { createStudentIfNotExists } from "@/sanity/lib/student/createStudentIfNotExists";
import { clerkClient } from "@clerk/nextjs/server";
import { createEnrollment } from "@/sanity/lib/courses/createEnrollment";
import getCourseById from "@/sanity/lib/courses/getCourseById";

// Define Mpesa API types
interface MpesaAccessTokenResponse {
  access_token: string;
}

interface MpesaPaymentRequest {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: string;
  Amount: number;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

const MPESA_API_URL = process.env.MPESA_API_URL!;
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY!;
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET!;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY!;
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE!;

/**
 * Fetches an access token from the Mpesa API.
 */
async function getAccessToken(): Promise<string> {
  try {
    // Encode the consumer key and secret for Basic Authentication
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");

    // Make the request to the Mpesa API
    const response = await axios.get<MpesaAccessTokenResponse>(
      `${MPESA_API_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    // Extract and return the access token
    const accessToken = response.data.access_token;
    console.log("Access Token:", accessToken);
    return accessToken;
  } catch (error: any) {
    console.error("Error fetching Mpesa access token:", error.message);
    console.error("Response data:", error.response?.data);
    throw new Error("Failed to fetch Mpesa access token");
  }
}

/**
 * Initiates an Mpesa payment using the STK push API.
 */
export async function initiateMpesaPayment(
  courseId: string,
  userId: string,
  phoneNumber: string
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Query course details from Sanity
    const course = await getCourseById(courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    const clerkUser = await (await clerkClient()).users.getUser(userId);
    const email = clerkUser.emailAddresses[0]?.emailAddress;

    if (!email) {
      throw new Error("User details not found");
    }

    // mid step - create a user in Sanity if it doesn't exist
    const user = await createStudentIfNotExists({
      clerkId: userId,
      email: email || "",
      firstName: clerkUser.firstName || email,
      lastName: clerkUser.lastName || "",
      imageUrl: clerkUser.imageUrl || "",
    });

    if (!user) {
      throw new Error("User not found");
    }

    // 2. Validate course data and prepare price for Mpesa
    if (!course.price && course.price !== 0) {
      throw new Error("Course price is not set");
    }
    const amount = course.price;

    // If course is free, create enrollment and redirect to course page
    if (amount === 0) {
      await createEnrollment({
        studentId: user._id,
        courseId: course._id,
        paymentId: "free",
        amount: 0,
      });

      return { success: true, message: "Enrolled successfully" };
    }

    // 3. Fetch the access token
    const accessToken = await getAccessToken();

    // 4. Generate the timestamp and password
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14); // YYYYMMDDHHmmss
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString("base64");

    // 5. Prepare the payment request payload
    const paymentRequest: MpesaPaymentRequest = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: phoneNumber,
      CallBackURL: `${process.env.BASE_URL}/api/webhook/route`,
      AccountReference: `COURSE-${courseId}`,
      TransactionDesc: `Payment for ${course.title}`,
    };

    console.log("Payment Request Payload:", paymentRequest);

    // 6. Make the STK push request
    const response = await axios.post(`${MPESA_API_URL}/mpesa/stkpush/v1/processrequest`, paymentRequest, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    // 7. Check the response
    if (response.data.ResponseCode === "0") {
      return { success: true, message: "Payment request sent successfully" };
    } else {
      throw new Error(response.data.errorMessage || "Failed to initiate Mpesa payment");
    }
  } catch (error: any) {
    console.error("Error initiating Mpesa payment:", error.message);
    console.error("Response data:", error.response?.data);
    throw new Error("Failed to initiate Mpesa payment");
  }
}