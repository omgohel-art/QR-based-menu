CREATE TABLE `cafeSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taxPercentage` decimal(5,2) NOT NULL DEFAULT '0',
	`serviceChargePercentage` decimal(5,2) NOT NULL DEFAULT '0',
	`inactivityWindowMinutes` int NOT NULL DEFAULT 75,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cafeSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`displayOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deviceRateLimits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceToken` varchar(64) NOT NULL,
	`lastSubmissionAt` timestamp NOT NULL DEFAULT (now()),
	`submissionCount` int NOT NULL DEFAULT 0,
	`windowResetAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deviceRateLimits_id` PRIMARY KEY(`id`),
	CONSTRAINT `deviceRateLimits_deviceToken_unique` UNIQUE(`deviceToken`)
);
--> statement-breakpoint
CREATE TABLE `menuItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`price` decimal(10,2) NOT NULL,
	`imageUrl` text,
	`isAvailable` boolean NOT NULL DEFAULT true,
	`displayOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menuItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orderHistories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`tableLabel` varchar(64) NOT NULL,
	`itemsSnapshot` json NOT NULL,
	`editsSnapshot` json NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	`taxAmount` decimal(10,2) NOT NULL,
	`serviceCharge` decimal(10,2) NOT NULL,
	`discountAmount` decimal(10,2) NOT NULL,
	`discountReason` text,
	`finalTotal` decimal(10,2) NOT NULL,
	`settledBy` int NOT NULL,
	`settledAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderHistories_id` PRIMARY KEY(`id`),
	CONSTRAINT `orderHistories_sessionId_unique` UNIQUE(`sessionId`)
);
--> statement-breakpoint
CREATE TABLE `orderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`menuItemId` int NOT NULL,
	`quantity` int NOT NULL,
	`priceAtOrderTime` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`submissionId` varchar(64) NOT NULL,
	`deviceToken` varchar(64) NOT NULL,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_submissionId_unique` UNIQUE(`submissionId`)
);
--> statement-breakpoint
CREATE TABLE `sessionEditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`changedBy` int NOT NULL,
	`changeType` enum('remove_item','adjust_quantity','apply_discount','apply_tax','apply_service_charge') NOT NULL,
	`itemId` int,
	`oldValue` text,
	`newValue` text,
	`reason` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessionEditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tableId` int NOT NULL,
	`status` enum('open','settled') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastActivityAt` timestamp NOT NULL DEFAULT (now()),
	`settledAt` timestamp,
	`settledBy` int,
	`subtotal` decimal(10,2) NOT NULL DEFAULT '0',
	`taxAmount` decimal(10,2) NOT NULL DEFAULT '0',
	`serviceCharge` decimal(10,2) NOT NULL DEFAULT '0',
	`discountAmount` decimal(10,2) NOT NULL DEFAULT '0',
	`discountReason` text,
	`finalTotal` decimal(10,2) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tableCode` varchar(32) NOT NULL,
	`label` varchar(64) NOT NULL,
	`status` enum('empty','active','flagged_inactive') NOT NULL DEFAULT 'empty',
	`activeSessionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tables_id` PRIMARY KEY(`id`),
	CONSTRAINT `tables_tableCode_unique` UNIQUE(`tableCode`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','staff') NOT NULL DEFAULT 'user';--> statement-breakpoint
CREATE INDEX `deviceToken_idx` ON `deviceRateLimits` (`deviceToken`);--> statement-breakpoint
CREATE INDEX `categoryId_idx` ON `menuItems` (`categoryId`);--> statement-breakpoint
CREATE INDEX `sessionId_idx` ON `orderHistories` (`sessionId`);--> statement-breakpoint
CREATE INDEX `orderId_idx` ON `orderItems` (`orderId`);--> statement-breakpoint
CREATE INDEX `sessionId_idx` ON `orders` (`sessionId`);--> statement-breakpoint
CREATE INDEX `submissionId_idx` ON `orders` (`submissionId`);--> statement-breakpoint
CREATE INDEX `sessionId_idx` ON `sessionEditLogs` (`sessionId`);--> statement-breakpoint
CREATE INDEX `tableId_idx` ON `sessions` (`tableId`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `sessions` (`status`);--> statement-breakpoint
CREATE INDEX `tableCode_idx` ON `tables` (`tableCode`);