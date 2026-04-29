"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type UserRole = "coach" | "athlete";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("athlete");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedEmail = email.trim().toLowerCase();

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          role,
        },
      },
    });

    if (error) {
      setErrorMessage(error.message || "Unable to create account.");
      setLoading(false);
      return;
    }

    if (!data.user) {
      setErrorMessage("Account created, but no user was returned.");
      setLoading(false);
      return;
    }

    // Ensure users row exists (trigger handles this server-side, but insert
    // here as a fallback for email-confirmation flows where the trigger may
    // fire before the session is established)
    await supabase.from("users").upsert(
      { id: data.user.id, email: trimmedEmail },
      { onConflict: "id", ignoreDuplicates: true }
    );

    const { error: roleInsertError } = await supabase.from("user_roles").insert({
      user_id: data.user.id,
      role,
    });

    if (roleInsertError) {
      setErrorMessage(
        `Account created, but the role could not be saved: ${roleInsertError.message}`
      );
      setLoading(false);
      return;
    }

    // Grant default features (coaches and athletes get race_info and kit_list by default)
    const { error: featureError } = await supabase.from("user_features").insert([
      {
        user_id: data.user.id,
        feature: "race_info",
      },
      {
        user_id: data.user.id,
        feature: "kit_list",
      },
    ]);

    if (featureError) {
      console.error("Feature grant error:", featureError);
      // Don't fail registration if feature grant fails
    }

    setSuccessMessage(
      "Account created successfully. You can now log in."
    );

    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setRole("athlete");
    setLoading(false);

    setTimeout(() => {
      router.push("/login");
      router.refresh();
    }, 1200);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#f5f5f5",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#ffffff",
          padding: "32px",
          borderRadius: "12px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ textAlign: "center", marginBottom: "24px" }}>
          Create account
        </h1>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email" style={{ display: "block", marginBottom: "8px" }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              marginBottom: "16px",
            }}
          />

          <label htmlFor="role" style={{ display: "block", marginBottom: "8px" }}>
            Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              marginBottom: "16px",
              background: "#fff",
            }}
          >
            <option value="athlete">Athlete</option>
            <option value="coach">Coach</option>
          </select>

          <label htmlFor="password" style={{ display: "block", marginBottom: "8px" }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="new-password"
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              marginBottom: "16px",
            }}
          />

          <label
            htmlFor="confirmPassword"
            style={{ display: "block", marginBottom: "8px" }}
          >
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            autoComplete="new-password"
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              marginBottom: "16px",
            }}
          />

          {errorMessage ? (
            <p style={{ color: "#b00020", marginBottom: "16px" }}>{errorMessage}</p>
          ) : null}

          {successMessage ? (
            <p style={{ color: "#0a7f3f", marginBottom: "16px" }}>{successMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "none",
              borderRadius: "8px",
              background: "#111111",
              color: "#ffffff",
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              marginBottom: "16px",
            }}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p style={{ textAlign: "center", margin: 0 }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#111111", fontWeight: 600 }}>
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}