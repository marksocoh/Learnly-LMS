"use client";

import { initiateMpesaPayment } from "@/actions/initiateMpesaPayment"
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from 'next/link'

function EnrollButton({
  courseId,
  isEnrolled,
}: {
  courseId: string;
  isEnrolled: boolean;
}) { 
  const { user } = useUser();
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [isPending, setIsPending] = useState<boolean>(false);

  const handleEnroll = async () => {
    if (!phoneNumber || phoneNumber.length <10) {
      alert("Please enter a valid phone number (e.g., 254712345678)");
      return;
    }

    setIsPending(true);

    try {
      const userId = user?.id;
      if (!userId) return;

      const result = await initiateMpesaPayment(courseId, userId, phoneNumber);
      if (result.success) {
        alert("Payment request sent successfully. Please complete the payment on your phone.");
      }
    } catch (error) {
      console.error("Error in handleEnroll:", error);
      alert("Failed to initiate payment");
    } finally {
      setIsPending(false);
    }
  };

  if (isEnrolled) {
    return (
      <Link href={`/dashboard/courses/${courseId}`} className="w-full rounded-lg px-6 py-3 font-medium bg-gradient-to-r from-green-500 to-emerald-500 text-white">
        Access Course
      </Link>
    );
  }

  return (
    <div>
      <input
        type="text"
        placeholder="Enter phone number (e.g., 254712345678)"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
        className="w-full mb-2 px-4 py-2 border rounded-lg"
      />
      <button
        className={`w-full rounded-lg px-6 py-3 font-medium transition-all duration-300 ease-in-out relative h-12 ${
          isPending ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white text-black hover:scale-105 hover:shadow-lg hover:shadow-black/10"
        }`}
        disabled={isPending}
        onClick={handleEnroll}
      >
        {isPending ? "Processing..." : "Enroll Now"}
      </button>
    </div>
  );
}

export default EnrollButton;