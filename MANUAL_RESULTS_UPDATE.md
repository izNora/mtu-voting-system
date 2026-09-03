# Manual Results Update

- Ending a festival now closes voting without automatically choosing title recipients.
- Completed-event vote data is retained until manual result confirmation.
- Admin Results shows each title with rank #1 selected by default and a dropdown containing that title's top 3 candidates by total vote weight.
- The admin must submit and confirm exactly one recipient for every title.
- Backend validates every submitted candidate belongs to that title's top 3 before saving MajorSelection/WholeSelection.
- After final confirmation, temporary voter/vote records for the event are cleaned up.
- Whole-admin results use the same manual selection flow.
- Whole-admin Remove now uses a non-submit button and an explicit confirmation dialog.
- Role-specific APIs retain authorization: developer, major admin, whole admin, organizer ownership, and voter-session checks. Login/QR verification endpoints are intentionally public bootstrap endpoints.
