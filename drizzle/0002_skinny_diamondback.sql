CREATE TABLE "rate_limits" (
	"channel" "channel" PRIMARY KEY NOT NULL,
	"next_available_at" timestamp with time zone DEFAULT now() NOT NULL
);
