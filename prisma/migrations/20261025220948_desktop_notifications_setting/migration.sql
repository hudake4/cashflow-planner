-- Switch for the desktop app's notifications (CONVENTIONS section 14). Existing rows become true, so an existing database keeps getting notifications until the user turns them off.
ALTER TABLE "Settings" ADD COLUMN "desktopNotifications" BOOLEAN NOT NULL DEFAULT true;
