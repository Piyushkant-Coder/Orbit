CREATE UNIQUE INDEX "Membership_one_owner_per_workspace"
ON "Membership" ("workspaceId")
WHERE "role" = 'OWNER';

ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_role_not_owner"
CHECK ("role" <> 'OWNER');
