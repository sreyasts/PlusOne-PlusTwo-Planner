# Security Policy

## Reporting Security Vulnerabilities

We take the security of our students' data seriously. If you discover a vulnerability in HSS Planner:

1. **Do not disclose it publicly** on GitHub issues or social media.
2. Please open a Private Security Advisory on GitHub or email the maintainer directly via their GitHub profile contact.
3. We will review the report and deploy a fix within 48 hours.

## Scope & Architectural Security

- **Client-Side Storage**: In Guest Mode, all data is stored strictly in the user's browser `localStorage`.
- **Cloud Firestore**: When signed in with Google, rules enforce that users can strictly read and write documents in `/users/{userId}` where `request.auth.uid == userId`.
- **Zero Third-Party Ad Trackers**: HSS Planner does not load third-party ad pixels or tracking cookies.
