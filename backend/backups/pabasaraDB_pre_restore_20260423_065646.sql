-- MySQL dump 10.13  Distrib 8.0.45, for Linux (x86_64)
--
-- Host: localhost    Database: pabasaraDB
-- ------------------------------------------------------
-- Server version	8.0.45-0ubuntu0.24.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `attendance`
--

DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `employee_id` bigint unsigned NOT NULL,
  `date` date NOT NULL,
  `in_time` time DEFAULT NULL,
  `out_time` time DEFAULT NULL,
  `work_hours` decimal(5,2) DEFAULT NULL,
  `status` enum('present','absent','late','half_day') COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `attendance_employee_id_date_unique` (`employee_id`,`date`),
  KEY `attendance_tenant_id_foreign` (`tenant_id`),
  KEY `attendance_branch_id_foreign` (`branch_id`),
  CONSTRAINT `attendance_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `attendance_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`),
  CONSTRAINT `attendance_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance`
--

LOCK TABLES `attendance` WRITE;
/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
INSERT INTO `attendance` VALUES (1,1,1,3,'2026-03-16','08:00:00',NULL,NULL,'present',NULL,'2026-03-16 00:54:31','2026-03-16 00:54:31'),(2,1,1,4,'2026-03-16','08:00:00',NULL,NULL,'present',NULL,'2026-03-16 00:57:27','2026-03-16 00:57:27'),(3,1,1,3,'2026-03-17','08:49:00',NULL,NULL,'late',NULL,'2026-03-17 14:19:42','2026-03-17 14:19:42');
/*!40000 ALTER TABLE `attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bom_headers`
--

DROP TABLE IF EXISTS `bom_headers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bom_headers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `version` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'v1',
  `batch_size` decimal(15,3) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bom_headers_product_id_version_unique` (`product_id`,`version`),
  CONSTRAINT `bom_headers_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bom_headers`
--

LOCK TABLES `bom_headers` WRITE;
/*!40000 ALTER TABLE `bom_headers` DISABLE KEYS */;
INSERT INTO `bom_headers` VALUES (2,3,'v1',1.000,1,NULL,'2026-03-17 00:28:32','2026-03-17 00:28:32'),(3,4,'v1',1000.000,1,NULL,'2026-03-17 14:36:52','2026-03-17 14:36:52');
/*!40000 ALTER TABLE `bom_headers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bom_items`
--

DROP TABLE IF EXISTS `bom_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bom_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `bom_id` bigint unsigned NOT NULL,
  `material_id` bigint unsigned NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `unit` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bom_items_bom_id_material_id_unique` (`bom_id`,`material_id`),
  KEY `bom_items_material_id_foreign` (`material_id`),
  CONSTRAINT `bom_items_bom_id_foreign` FOREIGN KEY (`bom_id`) REFERENCES `bom_headers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bom_items_material_id_foreign` FOREIGN KEY (`material_id`) REFERENCES `raw_materials` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bom_items`
--

LOCK TABLES `bom_items` WRITE;
/*!40000 ALTER TABLE `bom_items` DISABLE KEYS */;
INSERT INTO `bom_items` VALUES (2,2,4,2.0000,'kg','2026-03-17 00:28:32','2026-03-17 00:28:32'),(3,2,3,1.0000,'kg','2026-03-17 00:28:32','2026-03-17 00:28:32'),(4,2,2,1.0000,'liters','2026-03-17 00:28:32','2026-03-17 00:28:32'),(5,3,4,2.0000,'kg','2026-03-17 14:36:52','2026-03-17 14:36:52'),(6,3,3,2.0000,'kg','2026-03-17 14:36:52','2026-03-17 14:36:52');
/*!40000 ALTER TABLE `bom_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache`
--

DROP TABLE IF EXISTS `cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` int NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache`
--

LOCK TABLES `cache` WRITE;
/*!40000 ALTER TABLE `cache` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache_locks`
--

DROP TABLE IF EXISTS `cache_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache_locks` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` int NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache_locks`
--

LOCK TABLES `cache_locks` WRITE;
/*!40000 ALTER TABLE `cache_locks` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache_locks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `candidate_documents`
--

DROP TABLE IF EXISTS `candidate_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidate_documents` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `candidate_id` bigint unsigned NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `candidate_documents_candidate_id_foreign` (`candidate_id`),
  KEY `candidate_documents_type_index` (`type`),
  CONSTRAINT `candidate_documents_candidate_id_foreign` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `candidate_documents`
--

LOCK TABLES `candidate_documents` WRITE;
/*!40000 ALTER TABLE `candidate_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `candidate_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `candidate_educations`
--

DROP TABLE IF EXISTS `candidate_educations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidate_educations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `candidate_id` bigint unsigned NOT NULL,
  `institution` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `degree` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `field_of_study` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `grade` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `candidate_educations_candidate_id_foreign` (`candidate_id`),
  CONSTRAINT `candidate_educations_candidate_id_foreign` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `candidate_educations`
--

LOCK TABLES `candidate_educations` WRITE;
/*!40000 ALTER TABLE `candidate_educations` DISABLE KEYS */;
/*!40000 ALTER TABLE `candidate_educations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `candidate_experiences`
--

DROP TABLE IF EXISTS `candidate_experiences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidate_experiences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `candidate_id` bigint unsigned NOT NULL,
  `company` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT '0',
  `responsibilities` text COLLATE utf8mb4_unicode_ci,
  `achievements` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `candidate_experiences_candidate_id_foreign` (`candidate_id`),
  CONSTRAINT `candidate_experiences_candidate_id_foreign` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `candidate_experiences`
--

LOCK TABLES `candidate_experiences` WRITE;
/*!40000 ALTER TABLE `candidate_experiences` DISABLE KEYS */;
/*!40000 ALTER TABLE `candidate_experiences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `candidate_interview_participants`
--

DROP TABLE IF EXISTS `candidate_interview_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidate_interview_participants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `candidate_interview_id` bigint unsigned NOT NULL,
  `employee_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cip_interview_employee_unique` (`candidate_interview_id`,`employee_id`),
  KEY `cip_employee_fk` (`employee_id`),
  CONSTRAINT `cip_employee_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cip_interview_fk` FOREIGN KEY (`candidate_interview_id`) REFERENCES `candidate_interviews` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `candidate_interview_participants`
--

LOCK TABLES `candidate_interview_participants` WRITE;
/*!40000 ALTER TABLE `candidate_interview_participants` DISABLE KEYS */;
/*!40000 ALTER TABLE `candidate_interview_participants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `candidate_interviewers`
--

DROP TABLE IF EXISTS `candidate_interviewers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidate_interviewers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `candidate_id` bigint unsigned NOT NULL,
  `employee_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `candidate_interviewers_candidate_id_employee_id_unique` (`candidate_id`,`employee_id`),
  KEY `candidate_interviewers_employee_id_foreign` (`employee_id`),
  CONSTRAINT `candidate_interviewers_candidate_id_foreign` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `candidate_interviewers_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `candidate_interviewers`
--

LOCK TABLES `candidate_interviewers` WRITE;
/*!40000 ALTER TABLE `candidate_interviewers` DISABLE KEYS */;
/*!40000 ALTER TABLE `candidate_interviewers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `candidate_interviews`
--

DROP TABLE IF EXISTS `candidate_interviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidate_interviews` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `candidate_id` bigint unsigned NOT NULL,
  `interview_date` date NOT NULL,
  `interview_time` time NOT NULL,
  `interview_notes` text COLLATE utf8mb4_unicode_ci,
  `score` decimal(5,2) DEFAULT NULL,
  `result` enum('pending','pass','fail') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `candidate_interviews_candidate_id_foreign` (`candidate_id`),
  CONSTRAINT `candidate_interviews_candidate_id_foreign` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `candidate_interviews`
--

LOCK TABLES `candidate_interviews` WRITE;
/*!40000 ALTER TABLE `candidate_interviews` DISABLE KEYS */;
/*!40000 ALTER TABLE `candidate_interviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `candidates`
--

DROP TABLE IF EXISTS `candidates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `candidates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `candidate_code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `date_of_birth` date DEFAULT NULL,
  `position_applied` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cv_path` text COLLATE utf8mb4_unicode_ci,
  `photo_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('applied','shortlisted','interviewed','selected','rejected','hired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'applied',
  `interview_date` date DEFAULT NULL,
  `interview_time` time DEFAULT NULL,
  `interview_notes` text COLLATE utf8mb4_unicode_ci,
  `appointment_letter_path` text COLLATE utf8mb4_unicode_ci,
  `joining_date` date DEFAULT NULL,
  `expected_salary` decimal(10,2) DEFAULT NULL,
  `offered_salary` decimal(10,2) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `candidates_candidate_code_unique` (`candidate_code`),
  UNIQUE KEY `candidates_email_unique` (`email`),
  KEY `candidates_tenant_id_foreign` (`tenant_id`),
  KEY `candidates_branch_id_foreign` (`branch_id`),
  CONSTRAINT `candidates_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `candidates_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `candidates`
--

LOCK TABLES `candidates` WRITE;
/*!40000 ALTER TABLE `candidates` DISABLE KEYS */;
/*!40000 ALTER TABLE `candidates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cheque_registry_entries`
--

DROP TABLE IF EXISTS `cheque_registry_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cheque_registry_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint unsigned DEFAULT NULL,
  `company_cheque_account_id` bigint unsigned DEFAULT NULL,
  `distribution_payment_id` bigint unsigned DEFAULT NULL,
  `direction` enum('received','issued') COLLATE utf8mb4_unicode_ci NOT NULL,
  `lifecycle_status` enum('registered','deposited','cleared','bounced','issued') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'registered',
  `source_module` enum('manual','distribution','supplier_payment') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual',
  `cheque_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cheque_date` date DEFAULT NULL,
  `deposit_date` date DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `counterparty_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `cheque_registry_entries_company_id_foreign` (`company_id`),
  KEY `cheque_registry_entries_company_cheque_account_id_foreign` (`company_cheque_account_id`),
  KEY `cheque_registry_entries_distribution_payment_id_foreign` (`distribution_payment_id`),
  KEY `cheque_registry_entries_direction_lifecycle_status_index` (`direction`,`lifecycle_status`),
  KEY `cheque_registry_entries_source_module_index` (`source_module`),
  KEY `cheque_registry_entries_cheque_no_index` (`cheque_no`),
  CONSTRAINT `cheque_registry_entries_company_cheque_account_id_foreign` FOREIGN KEY (`company_cheque_account_id`) REFERENCES `company_cheque_accounts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `cheque_registry_entries_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `cheque_registry_entries_distribution_payment_id_foreign` FOREIGN KEY (`distribution_payment_id`) REFERENCES `distribution_payments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cheque_registry_entries`
--

LOCK TABLES `cheque_registry_entries` WRITE;
/*!40000 ALTER TABLE `cheque_registry_entries` DISABLE KEYS */;
/*!40000 ALTER TABLE `cheque_registry_entries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `companies`
--

DROP TABLE IF EXISTS `companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `companies` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `phone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Sri Lanka',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'LKR',
  `logo_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_cash_balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `current_bank_balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_cheque_balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `companies_email_unique` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `companies`
--

LOCK TABLES `companies` WRITE;
/*!40000 ALTER TABLE `companies` DISABLE KEYS */;
INSERT INTO `companies` VALUES (1,'Pabasara Sweets','info@pabasarasweets.com','90/L, Parakaduwa','0712323225',NULL,'Sri Lanka','LKR','company-logos/9Dk4EPCyygRoHw78B2QcTeER2mTAdosNs0XgLOC1.jpg',0.00,0.00,NULL,NULL,0.00,'2026-02-27 01:38:36','2026-03-17 07:07:55');
/*!40000 ALTER TABLE `companies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_bank_accounts`
--

DROP TABLE IF EXISTS `company_bank_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `company_bank_accounts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint unsigned NOT NULL,
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `current_balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `company_bank_accounts_company_id_foreign` (`company_id`),
  CONSTRAINT `company_bank_accounts_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_bank_accounts`
--

LOCK TABLES `company_bank_accounts` WRITE;
/*!40000 ALTER TABLE `company_bank_accounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `company_bank_accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_cheque_accounts`
--

DROP TABLE IF EXISTS `company_cheque_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `company_cheque_accounts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint unsigned NOT NULL,
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_no` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `current_balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `company_cheque_accounts_company_id_foreign` (`company_id`),
  CONSTRAINT `company_cheque_accounts_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_cheque_accounts`
--

LOCK TABLES `company_cheque_accounts` WRITE;
/*!40000 ALTER TABLE `company_cheque_accounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `company_cheque_accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `delivery_cash_transactions`
--

DROP TABLE IF EXISTS `delivery_cash_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_cash_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `type` enum('in','out') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `delivery_cash_transactions_created_by_foreign` (`created_by`),
  CONSTRAINT `delivery_cash_transactions_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `delivery_cash_transactions`
--

LOCK TABLES `delivery_cash_transactions` WRITE;
/*!40000 ALTER TABLE `delivery_cash_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `delivery_cash_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `departments`
--

DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `departments_tenant_id_name_unique` (`tenant_id`,`name`),
  KEY `departments_branch_id_foreign` (`branch_id`),
  CONSTRAINT `departments_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `departments_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `departments`
--

LOCK TABLES `departments` WRITE;
/*!40000 ALTER TABLE `departments` DISABLE KEYS */;
INSERT INTO `departments` VALUES (1,1,1,'Operations','Operations Department',1,'2026-02-27 01:39:32','2026-02-27 01:39:32'),(2,1,1,'Logistics','Logistics and Transportation Department',1,'2026-02-27 01:39:32','2026-02-27 01:39:32');
/*!40000 ALTER TABLE `departments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `designations`
--

DROP TABLE IF EXISTS `designations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `designations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `salary_range_min` decimal(10,2) DEFAULT NULL,
  `salary_range_max` decimal(10,2) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `designations_tenant_id_name_unique` (`tenant_id`,`name`),
  KEY `designations_branch_id_foreign` (`branch_id`),
  CONSTRAINT `designations_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `designations_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `designations`
--

LOCK TABLES `designations` WRITE;
/*!40000 ALTER TABLE `designations` DISABLE KEYS */;
INSERT INTO `designations` VALUES (1,1,1,'Driver','Vehicle Driver',30000.00,50000.00,1,'2026-02-27 01:39:35','2026-02-27 01:39:35'),(2,1,1,'Operations Manager','Operations Manager',60000.00,80000.00,1,'2026-02-27 01:39:35','2026-02-27 01:39:35'),(3,1,1,'Sales Ref','Sales Ref',NULL,NULL,1,'2026-03-05 21:26:13','2026-03-05 21:26:13'),(4,1,1,'HR Manager',NULL,NULL,NULL,1,'2026-03-12 15:47:29','2026-03-12 15:47:29'),(5,1,1,'Software Engineer','software engineer',NULL,NULL,1,'2026-03-17 14:16:06','2026-03-17 14:16:06');
/*!40000 ALTER TABLE `designations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `distribution_customers`
--

DROP TABLE IF EXISTS `distribution_customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `distribution_customers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `shop_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `route_id` bigint unsigned DEFAULT NULL,
  `outstanding` decimal(12,2) NOT NULL DEFAULT '0.00',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `distribution_customers_customer_code_unique` (`customer_code`),
  KEY `distribution_customers_route_id_foreign` (`route_id`),
  CONSTRAINT `distribution_customers_route_id_foreign` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `distribution_customers`
--

LOCK TABLES `distribution_customers` WRITE;
/*!40000 ALTER TABLE `distribution_customers` DISABLE KEYS */;
INSERT INTO `distribution_customers` VALUES (1,'GNK Stores','001','Gamini','0714545225',NULL,'Eheliyagoda',NULL,0.00,'active','2026-03-05 10:58:50','2026-03-05 10:58:50'),(4,'Samith Sweets','CUS-260317132153-895','Samith','0712323778',NULL,'Parakaduwa',11,0.00,'active','2026-03-17 06:52:24','2026-03-17 06:52:24');
/*!40000 ALTER TABLE `distribution_customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `distribution_invoice_items`
--

DROP TABLE IF EXISTS `distribution_invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `distribution_invoice_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `distribution_invoice_id` bigint unsigned NOT NULL,
  `load_id` bigint unsigned DEFAULT NULL,
  `inventory_item_id` bigint unsigned DEFAULT NULL,
  `item_code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` decimal(12,2) NOT NULL DEFAULT '0.00',
  `unit_price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `line_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `distribution_invoice_items_distribution_invoice_id_foreign` (`distribution_invoice_id`),
  KEY `distribution_invoice_items_load_id_foreign` (`load_id`),
  KEY `distribution_invoice_items_inventory_item_id_foreign` (`inventory_item_id`),
  CONSTRAINT `distribution_invoice_items_distribution_invoice_id_foreign` FOREIGN KEY (`distribution_invoice_id`) REFERENCES `distribution_invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `distribution_invoice_items_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `distribution_invoice_items_load_id_foreign` FOREIGN KEY (`load_id`) REFERENCES `loads` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `distribution_invoice_items`
--

LOCK TABLES `distribution_invoice_items` WRITE;
/*!40000 ALTER TABLE `distribution_invoice_items` DISABLE KEYS */;
INSERT INTO `distribution_invoice_items` VALUES (17,14,NULL,NULL,'HH78','Gal Banis','pieces',2.00,60.00,0.00,120.00,'2026-03-15 22:40:08','2026-03-15 22:40:08'),(18,15,NULL,4,'PO-SUGER','Suger','kg',1.00,0.00,0.00,0.00,'2026-03-17 12:55:35','2026-03-17 12:55:35');
/*!40000 ALTER TABLE `distribution_invoice_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `distribution_invoices`
--

DROP TABLE IF EXISTS `distribution_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `distribution_invoices` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `load_id` bigint unsigned DEFAULT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `subtotal` decimal(12,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `paid_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `status` enum('pending','partial','paid','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `distribution_invoices_invoice_number_unique` (`invoice_number`),
  KEY `distribution_invoices_customer_id_foreign` (`customer_id`),
  KEY `distribution_invoices_load_id_foreign` (`load_id`),
  CONSTRAINT `distribution_invoices_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `distribution_customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `distribution_invoices_load_id_foreign` FOREIGN KEY (`load_id`) REFERENCES `loads` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `distribution_invoices`
--

LOCK TABLES `distribution_invoices` WRITE;
/*!40000 ALTER TABLE `distribution_invoices` DISABLE KEYS */;
INSERT INTO `distribution_invoices` VALUES (14,'INV-20260316-770',1,NULL,'2026-03-16','2026-03-17',120.00,0.00,120.00,120.00,'paid','[INVOICE LINES]\nLine breakdown:\n- 2.00 paid + 0.00 free x Gal Banis (HH78) @ base 60.00, disc/unit 0.00, effective 60.00 => paid total 120.00',2,'2026-03-15 22:40:08','2026-03-15 22:40:09'),(15,'INV-20260317-724',4,NULL,'2026-03-17','2026-03-28',0.00,0.00,0.00,0.00,'pending','[INVOICE LINES]\nLine breakdown:\n- 1.00 paid + 0.00 free x Suger (PO-SUGER) @ base 0.00, disc/unit 0.00, effective 0.00 => paid total 0.00',2,'2026-03-17 12:55:35','2026-03-17 12:55:35');
/*!40000 ALTER TABLE `distribution_invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `distribution_payments`
--

DROP TABLE IF EXISTS `distribution_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `distribution_payments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `payment_number` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `distribution_invoice_id` bigint unsigned DEFAULT NULL,
  `load_id` bigint unsigned DEFAULT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `payment_date` date NOT NULL,
  `cheque_date` date DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `payment_method` enum('check','cash','bank_transfer') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('received','cleared','bounced','pending') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'received',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `received_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `distribution_payments_payment_number_unique` (`payment_number`),
  KEY `distribution_payments_distribution_invoice_id_foreign` (`distribution_invoice_id`),
  KEY `distribution_payments_load_id_foreign` (`load_id`),
  KEY `distribution_payments_customer_id_foreign` (`customer_id`),
  CONSTRAINT `distribution_payments_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `distribution_customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `distribution_payments_distribution_invoice_id_foreign` FOREIGN KEY (`distribution_invoice_id`) REFERENCES `distribution_invoices` (`id`) ON DELETE SET NULL,
  CONSTRAINT `distribution_payments_load_id_foreign` FOREIGN KEY (`load_id`) REFERENCES `loads` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `distribution_payments`
--

LOCK TABLES `distribution_payments` WRITE;
/*!40000 ALTER TABLE `distribution_payments` DISABLE KEYS */;
INSERT INTO `distribution_payments` VALUES (6,'PAY-20260316-582',14,NULL,1,'2026-03-16',NULL,120.00,'cash',NULL,NULL,'received','Auto payment from invoice INV-20260316-770',2,'2026-03-15 22:40:09','2026-03-15 22:40:09');
/*!40000 ALTER TABLE `distribution_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `distribution_returns`
--

DROP TABLE IF EXISTS `distribution_returns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `distribution_returns` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `return_number` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `distribution_invoice_id` bigint unsigned DEFAULT NULL,
  `load_id` bigint unsigned DEFAULT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `returned_inventory_item_id` bigint unsigned DEFAULT NULL,
  `return_date` date NOT NULL,
  `total_quantity` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `settlement_type` enum('bill_deduction','cash_refund','item_exchange') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'bill_deduction',
  `settlement_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `exchange_inventory_item_id` bigint unsigned DEFAULT NULL,
  `exchange_quantity` decimal(12,2) NOT NULL DEFAULT '0.00',
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `distribution_returns_return_number_unique` (`return_number`),
  KEY `distribution_returns_distribution_invoice_id_foreign` (`distribution_invoice_id`),
  KEY `distribution_returns_load_id_foreign` (`load_id`),
  KEY `distribution_returns_customer_id_foreign` (`customer_id`),
  KEY `distribution_returns_returned_inventory_item_id_foreign` (`returned_inventory_item_id`),
  KEY `distribution_returns_exchange_inventory_item_id_foreign` (`exchange_inventory_item_id`),
  CONSTRAINT `distribution_returns_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `distribution_customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `distribution_returns_distribution_invoice_id_foreign` FOREIGN KEY (`distribution_invoice_id`) REFERENCES `distribution_invoices` (`id`) ON DELETE SET NULL,
  CONSTRAINT `distribution_returns_exchange_inventory_item_id_foreign` FOREIGN KEY (`exchange_inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `distribution_returns_load_id_foreign` FOREIGN KEY (`load_id`) REFERENCES `loads` (`id`) ON DELETE SET NULL,
  CONSTRAINT `distribution_returns_returned_inventory_item_id_foreign` FOREIGN KEY (`returned_inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `distribution_returns`
--

LOCK TABLES `distribution_returns` WRITE;
/*!40000 ALTER TABLE `distribution_returns` DISABLE KEYS */;
/*!40000 ALTER TABLE `distribution_returns` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employee_allowances_deductions`
--

DROP TABLE IF EXISTS `employee_allowances_deductions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_allowances_deductions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `type` enum('allowance','deduction') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_type` enum('fixed','percentage') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fixed',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `employee_allowances_deductions_employee_id_foreign` (`employee_id`),
  CONSTRAINT `employee_allowances_deductions_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_allowances_deductions`
--

LOCK TABLES `employee_allowances_deductions` WRITE;
/*!40000 ALTER TABLE `employee_allowances_deductions` DISABLE KEYS */;
/*!40000 ALTER TABLE `employee_allowances_deductions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employee_documents`
--

DROP TABLE IF EXISTS `employee_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_documents` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` bigint unsigned NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `employee_documents_employee_id_foreign` (`employee_id`),
  KEY `employee_documents_type_index` (`type`),
  KEY `employee_documents_branch_id_foreign` (`branch_id`),
  CONSTRAINT `employee_documents_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `employee_documents_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_documents`
--

LOCK TABLES `employee_documents` WRITE;
/*!40000 ALTER TABLE `employee_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `employee_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employee_educations`
--

DROP TABLE IF EXISTS `employee_educations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_educations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` bigint unsigned NOT NULL,
  `institution` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `degree` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `field_of_study` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `grade` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `employee_educations_employee_id_foreign` (`employee_id`),
  KEY `employee_educations_branch_id_foreign` (`branch_id`),
  CONSTRAINT `employee_educations_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `employee_educations_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_educations`
--

LOCK TABLES `employee_educations` WRITE;
/*!40000 ALTER TABLE `employee_educations` DISABLE KEYS */;
/*!40000 ALTER TABLE `employee_educations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employee_experiences`
--

DROP TABLE IF EXISTS `employee_experiences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_experiences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` bigint unsigned NOT NULL,
  `company` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT '0',
  `responsibilities` text COLLATE utf8mb4_unicode_ci,
  `achievements` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `employee_experiences_employee_id_foreign` (`employee_id`),
  KEY `employee_experiences_branch_id_foreign` (`branch_id`),
  CONSTRAINT `employee_experiences_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `employee_experiences_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_experiences`
--

LOCK TABLES `employee_experiences` WRITE;
/*!40000 ALTER TABLE `employee_experiences` DISABLE KEYS */;
/*!40000 ALTER TABLE `employee_experiences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employees`
--

DROP TABLE IF EXISTS `employees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employees` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `employee_code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mobile` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nic_passport` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `photo_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `gender` enum('male','female','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_id` bigint unsigned NOT NULL,
  `designation_id` bigint unsigned NOT NULL,
  `join_date` date NOT NULL,
  `basic_salary` decimal(10,2) NOT NULL,
  `commission` decimal(5,2) DEFAULT NULL,
  `commission_base` enum('company_profit','own_business') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `overtime_payment_per_hour` decimal(8,2) DEFAULT NULL,
  `deduction_late_hour` decimal(8,2) DEFAULT NULL,
  `epf_employee_contribution` decimal(5,2) DEFAULT NULL,
  `epf_employer_contribution` decimal(5,2) DEFAULT NULL,
  `etf_employee_contribution` decimal(5,2) DEFAULT NULL,
  `etf_employer_contribution` decimal(5,2) DEFAULT NULL,
  `tin` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tax_applicable` tinyint(1) NOT NULL DEFAULT '0',
  `tax_relief_eligible` tinyint(1) NOT NULL DEFAULT '0',
  `apit_tax_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `apit_tax_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `employee_type` enum('full_time','part_time','contract') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employees_employee_code_unique` (`employee_code`),
  UNIQUE KEY `employees_email_unique` (`email`),
  UNIQUE KEY `employees_nic_passport_unique` (`nic_passport`),
  KEY `employees_tenant_id_foreign` (`tenant_id`),
  KEY `employees_branch_id_foreign` (`branch_id`),
  KEY `employees_department_id_foreign` (`department_id`),
  KEY `employees_designation_id_foreign` (`designation_id`),
  CONSTRAINT `employees_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `employees_department_id_foreign` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `employees_designation_id_foreign` FOREIGN KEY (`designation_id`) REFERENCES `designations` (`id`),
  CONSTRAINT `employees_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employees`
--

LOCK TABLES `employees` WRITE;
/*!40000 ALTER TABLE `employees` DISABLE KEYS */;
INSERT INTO `employees` VALUES (3,1,1,'EMP001','John','Doe','john.doe@company.com','+94123456789','123456789V','123 Main Street, Colombo',NULL,'1985-05-15','male',1,1,'2023-01-15',45000.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0.00,0.00,'full_time','active',NULL,'2026-02-27 01:39:39','2026-02-27 01:39:39'),(4,1,1,'EMP002','Jane','Smith','jane.smith@company.com','+94123456791','987654321V','456 Oak Avenue, Kandy',NULL,'1988-08-20','female',1,1,'2023-02-20',42000.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0.00,0.00,'full_time','active',NULL,'2026-02-27 01:39:39','2026-02-27 01:39:39'),(5,1,1,'EMP003','Mike','Johnson','mike.johnson@company.com','+94123456793','456789123V','789 Pine Road, Galle',NULL,'1982-12-10','male',1,1,'2023-03-10',48000.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0,0.00,0.00,'full_time','active',NULL,'2026-02-27 01:39:39','2026-02-27 01:39:39'),(6,1,1,'EMP0001','Jagath','Siriwardhana','jagath@gmail.com','0714545889','TEMP1772686002','Eheliyagoda',NULL,'1993-03-12','other',1,2,'2026-03-05',35000.00,0.00,NULL,150.00,100.00,NULL,NULL,NULL,NULL,NULL,0,0,0.00,0.00,'full_time','active',NULL,'2026-03-04 23:16:42','2026-03-04 23:16:42'),(7,1,1,'EMP0002','Amila','Sandaruwan','amilaasndaruwan@gmail.com','0714545225','TEMP1772765974','Eheliyagoda',NULL,'1993-02-06','other',2,3,'2026-03-06',30000.00,10.00,'own_business',200.00,200.00,NULL,NULL,NULL,NULL,NULL,0,0,0.00,0.00,'full_time','active',NULL,'2026-03-05 21:29:34','2026-03-05 21:29:34'),(8,1,1,'EMP0003','Samiru','Dilshan','samiru@gmail.com','0714545889','TEMP1773079788','Eheliyagoda',NULL,'1993-03-07','other',2,3,'2026-03-09',56000.00,10.00,'own_business',149.99,0.00,NULL,NULL,NULL,NULL,NULL,0,0,0.00,0.00,'full_time','active',NULL,'2026-03-09 12:39:48','2026-03-09 12:39:48');
/*!40000 ALTER TABLE `employees` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `failed_jobs`
--

DROP TABLE IF EXISTS `failed_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failed_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connection` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `exception` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `failed_jobs`
--

LOCK TABLES `failed_jobs` WRITE;
/*!40000 ALTER TABLE `failed_jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `failed_jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `goods_received_notes`
--

DROP TABLE IF EXISTS `goods_received_notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `goods_received_notes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `grn_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purchase_order_id` bigint unsigned NOT NULL,
  `received_date` date NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `status` enum('draft','received','inspected','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `total_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `discount_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `net_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `payment_status` enum('unpaid','partial','paid') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `payment_timing` enum('post_payment','on_time') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'post_payment',
  `payment_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paid_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `paid_at` datetime DEFAULT NULL,
  `payment_note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `goods_received_notes_grn_number_unique` (`grn_number`),
  KEY `goods_received_notes_purchase_order_id_foreign` (`purchase_order_id`),
  CONSTRAINT `goods_received_notes_purchase_order_id_foreign` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `goods_received_notes`
--

LOCK TABLES `goods_received_notes` WRITE;
/*!40000 ALTER TABLE `goods_received_notes` DISABLE KEYS */;
INSERT INTO `goods_received_notes` VALUES (8,'GRN20260001',9,'2026-03-17',NULL,'received',0.00,0.00,0.00,'unpaid','post_payment',NULL,NULL,0.00,NULL,NULL,'2026-03-17 00:20:23','2026-03-17 00:20:23');
/*!40000 ALTER TABLE `goods_received_notes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `grn_items`
--

DROP TABLE IF EXISTS `grn_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `grn_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `grn_id` bigint unsigned NOT NULL,
  `purchase_order_item_id` bigint unsigned NOT NULL,
  `received_quantity` decimal(10,2) NOT NULL,
  `accepted_quantity` decimal(10,2) NOT NULL DEFAULT '0.00',
  `rejected_quantity` decimal(10,2) NOT NULL DEFAULT '0.00',
  `purchase_price` decimal(10,2) DEFAULT NULL,
  `sell_price` decimal(10,2) DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `quality_status` enum('pending','accepted','rejected','partial') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `grn_items_grn_id_foreign` (`grn_id`),
  KEY `grn_items_purchase_order_item_id_foreign` (`purchase_order_item_id`),
  CONSTRAINT `grn_items_grn_id_foreign` FOREIGN KEY (`grn_id`) REFERENCES `goods_received_notes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `grn_items_purchase_order_item_id_foreign` FOREIGN KEY (`purchase_order_item_id`) REFERENCES `purchase_order_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `grn_items`
--

LOCK TABLES `grn_items` WRITE;
/*!40000 ALTER TABLE `grn_items` DISABLE KEYS */;
INSERT INTO `grn_items` VALUES (13,8,3,10.00,10.00,0.00,500.00,520.00,'2026-03-31',NULL,'accepted','2026-03-17 00:20:23','2026-03-17 00:20:23'),(14,8,4,50.00,50.00,0.00,138.00,250.00,'2026-05-17',NULL,'accepted','2026-03-17 00:20:23','2026-03-17 00:20:23'),(15,8,5,100.00,100.00,0.00,210.00,300.00,'2026-11-24',NULL,'accepted','2026-03-17 00:20:23','2026-03-17 00:20:23');
/*!40000 ALTER TABLE `grn_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_items`
--

DROP TABLE IF EXISTS `inventory_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `type` enum('raw_material','finished_good') COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `current_stock` decimal(15,2) NOT NULL DEFAULT '0.00',
  `minimum_stock` decimal(15,2) NOT NULL DEFAULT '0.00',
  `maximum_stock` decimal(15,2) DEFAULT NULL,
  `unit_price` decimal(15,2) NOT NULL DEFAULT '0.00',
  `purchase_price` decimal(10,2) DEFAULT NULL,
  `sell_price` decimal(10,2) DEFAULT NULL,
  `supplier_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supplier_id` bigint unsigned DEFAULT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `additional_info` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_items_code_unique` (`code`),
  KEY `inventory_items_supplier_id_foreign` (`supplier_id`),
  CONSTRAINT `inventory_items_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_items`
--

LOCK TABLES `inventory_items` WRITE;
/*!40000 ALTER TABLE `inventory_items` DISABLE KEYS */;
INSERT INTO `inventory_items` VALUES (3,'Cocunet Oil','PO-COCUNETO','Auto-created from purchase order item entry.','raw_material','Purchased Items','liters',10.00,0.00,NULL,500.00,500.00,NULL,'Akalanka Imesh',1,'Main Store',NULL,'active',NULL,'2026-03-17 00:18:34','2026-03-17 00:20:23'),(4,'Suger','PO-SUGER','Auto-created from purchase order item entry.','raw_material','Purchased Items','kg',47.00,0.00,NULL,138.00,138.00,NULL,'Akalanka Imesh',1,'Main Store',NULL,'active',NULL,'2026-03-17 00:18:34','2026-03-17 14:40:26'),(5,'White Flover','PO-WHITEFLO','Auto-created from purchase order item entry.','raw_material','Purchased Items','kg',98.00,0.00,NULL,210.00,210.00,NULL,'Akalanka Imesh',1,'Main Store',NULL,'active',NULL,'2026-03-17 00:18:34','2026-03-17 14:40:26'),(6,'Thala Kerali','002',NULL,'finished_good','Sweets Products','pieces',400.00,0.00,0.00,40.00,NULL,NULL,'Akalanka Imesh',1,'df','2026-03-31','active',NULL,'2026-03-17 14:48:05','2026-03-17 14:59:30'),(7,'thala kerali 290','003',NULL,'finished_good','Sweets','pieces',900.00,0.00,0.00,0.00,NULL,NULL,'Akalanka Imesh',1,NULL,'2026-03-28','active',NULL,'2026-03-17 14:58:37','2026-03-17 14:59:17');
/*!40000 ALTER TABLE `inventory_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `job_batches`
--

DROP TABLE IF EXISTS `job_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_batches` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_jobs` int NOT NULL,
  `pending_jobs` int NOT NULL,
  `failed_jobs` int NOT NULL,
  `failed_job_ids` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` mediumtext COLLATE utf8mb4_unicode_ci,
  `cancelled_at` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `finished_at` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `job_batches`
--

LOCK TABLES `job_batches` WRITE;
/*!40000 ALTER TABLE `job_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `job_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jobs`
--

DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` tinyint unsigned NOT NULL,
  `reserved_at` int unsigned DEFAULT NULL,
  `available_at` int unsigned NOT NULL,
  `created_at` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jobs`
--

LOCK TABLES `jobs` WRITE;
/*!40000 ALTER TABLE `jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `leave_types`
--

DROP TABLE IF EXISTS `leave_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leave_types` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `max_days_per_year` int NOT NULL DEFAULT '0',
  `requires_documentation` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `leave_types_code_unique` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leave_types`
--

LOCK TABLES `leave_types` WRITE;
/*!40000 ALTER TABLE `leave_types` DISABLE KEYS */;
INSERT INTO `leave_types` VALUES (1,'Annual Leave','annual','Regular annual leave entitlement',14,0,1,'2026-02-22 23:20:34','2026-03-17 14:24:55'),(2,'Casual Leave','casual','Short-term casual leave',7,0,1,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(3,'Medical Leave','medical','Medical or sick leave',14,1,1,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(4,'Maternity Leave','maternity','Maternity leave for new mothers',84,1,1,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(5,'Other Leave','other','Other types of leave',10,1,1,'2026-02-22 23:20:34','2026-02-22 23:20:34');
/*!40000 ALTER TABLE `leave_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `leaves`
--

DROP TABLE IF EXISTS `leaves`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leaves` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `employee_id` bigint unsigned NOT NULL,
  `leave_type` enum('annual','casual','medical','maternity','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `days_requested` int NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','section_head_approved','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `approved_by` bigint unsigned DEFAULT NULL,
  `approver_notes` text COLLATE utf8mb4_unicode_ci,
  `approved_at` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `section_head_approved` tinyint(1) NOT NULL DEFAULT '0',
  `section_head_approved_by` bigint unsigned DEFAULT NULL,
  `section_head_approved_at` timestamp NULL DEFAULT NULL,
  `section_head_notes` text COLLATE utf8mb4_unicode_ci,
  `hr_approved` tinyint(1) NOT NULL DEFAULT '0',
  `hr_approved_by` bigint unsigned DEFAULT NULL,
  `hr_approved_at` timestamp NULL DEFAULT NULL,
  `hr_notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `leaves_tenant_id_foreign` (`tenant_id`),
  KEY `leaves_branch_id_foreign` (`branch_id`),
  KEY `leaves_employee_id_foreign` (`employee_id`),
  KEY `leaves_approved_by_foreign` (`approved_by`),
  KEY `leaves_section_head_approved_by_foreign` (`section_head_approved_by`),
  KEY `leaves_hr_approved_by_foreign` (`hr_approved_by`),
  CONSTRAINT `leaves_approved_by_foreign` FOREIGN KEY (`approved_by`) REFERENCES `employees` (`id`),
  CONSTRAINT `leaves_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `leaves_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`),
  CONSTRAINT `leaves_hr_approved_by_foreign` FOREIGN KEY (`hr_approved_by`) REFERENCES `employees` (`id`),
  CONSTRAINT `leaves_section_head_approved_by_foreign` FOREIGN KEY (`section_head_approved_by`) REFERENCES `employees` (`id`),
  CONSTRAINT `leaves_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leaves`
--

LOCK TABLES `leaves` WRITE;
/*!40000 ALTER TABLE `leaves` DISABLE KEYS */;
/*!40000 ALTER TABLE `leaves` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `load_expenses`
--

DROP TABLE IF EXISTS `load_expenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `load_expenses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `load_id` bigint unsigned NOT NULL,
  `expense_date` date NOT NULL,
  `expense_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `delivery_cash_transaction_id` bigint unsigned DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `load_expenses_load_id_foreign` (`load_id`),
  KEY `load_expenses_delivery_cash_transaction_id_foreign` (`delivery_cash_transaction_id`),
  KEY `load_expenses_created_by_foreign` (`created_by`),
  CONSTRAINT `load_expenses_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `load_expenses_delivery_cash_transaction_id_foreign` FOREIGN KEY (`delivery_cash_transaction_id`) REFERENCES `delivery_cash_transactions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `load_expenses_load_id_foreign` FOREIGN KEY (`load_id`) REFERENCES `loads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `load_expenses`
--

LOCK TABLES `load_expenses` WRITE;
/*!40000 ALTER TABLE `load_expenses` DISABLE KEYS */;
/*!40000 ALTER TABLE `load_expenses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `load_items`
--

DROP TABLE IF EXISTS `load_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `load_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `load_id` bigint unsigned NOT NULL,
  `product_code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('finished_product','raw_material') COLLATE utf8mb4_unicode_ci NOT NULL,
  `out_price` decimal(10,2) NOT NULL,
  `sell_price` decimal(10,2) NOT NULL,
  `qty` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `load_items_load_id_type_index` (`load_id`,`type`),
  KEY `load_items_product_code_index` (`product_code`),
  CONSTRAINT `load_items_load_id_foreign` FOREIGN KEY (`load_id`) REFERENCES `loads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `load_items`
--

LOCK TABLES `load_items` WRITE;
/*!40000 ALTER TABLE `load_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `load_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `loads`
--

DROP TABLE IF EXISTS `loads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loads` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `load_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_id` bigint unsigned NOT NULL,
  `driver_id` bigint unsigned NOT NULL,
  `sales_ref_id` bigint unsigned DEFAULT NULL,
  `route_id` bigint unsigned NOT NULL,
  `status` enum('pending','in_transit','delivered','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `load_date` date NOT NULL,
  `delivery_date` date DEFAULT NULL,
  `total_weight` decimal(10,2) NOT NULL DEFAULT '0.00',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `loads_load_number_unique` (`load_number`),
  KEY `loads_vehicle_id_foreign` (`vehicle_id`),
  KEY `loads_driver_id_foreign` (`driver_id`),
  KEY `loads_route_id_foreign` (`route_id`),
  KEY `loads_sales_ref_id_foreign` (`sales_ref_id`),
  CONSTRAINT `loads_driver_id_foreign` FOREIGN KEY (`driver_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `loads_route_id_foreign` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `loads_sales_ref_id_foreign` FOREIGN KEY (`sales_ref_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `loads_vehicle_id_foreign` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `loads`
--

LOCK TABLES `loads` WRITE;
/*!40000 ALTER TABLE `loads` DISABLE KEYS */;
/*!40000 ALTER TABLE `loads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `main_cash_transactions`
--

DROP TABLE IF EXISTS `main_cash_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `main_cash_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `type` enum('in','out') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `main_cash_transactions_created_by_foreign` (`created_by`),
  CONSTRAINT `main_cash_transactions_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `main_cash_transactions`
--

LOCK TABLES `main_cash_transactions` WRITE;
/*!40000 ALTER TABLE `main_cash_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `main_cash_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `migrations`
--

DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=117 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `migrations`
--

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,'0001_01_01_000000_create_users_table',1),(2,'0001_01_01_000001_create_cache_table',1),(3,'0001_01_01_000002_create_jobs_table',1),(4,'2025_12_06_054740_create_personal_access_tokens_table',1),(5,'2025_12_06_054748_create_companies_table',1),(6,'2025_12_06_075700_create_departments_table',1),(7,'2025_12_06_075704_create_designations_table',1),(8,'2025_12_06_075709_create_employees_table',1),(9,'2025_12_06_075712_create_attendance_table',1),(10,'2025_12_06_075718_create_leaves_table',1),(11,'2025_12_06_075721_create_payrolls_table',1),(12,'2025_12_12_063107_add_commission_fields_to_employees_table',1),(13,'2025_12_12_064818_make_date_of_birth_nullable_in_employees_table',1),(14,'2025_12_12_065152_create_candidates_table',1),(15,'2025_12_12_100000_create_candidate_documents_table',1),(16,'2025_12_12_100100_create_candidate_educations_table',1),(17,'2025_12_12_100200_create_candidate_experiences_table',1),(18,'2025_12_12_110000_add_photo_path_to_candidates_table',1),(19,'2025_12_12_120000_create_candidate_interviewers_table',1),(20,'2025_12_12_130000_create_candidate_interviews_table',1),(21,'2025_12_12_130100_create_candidate_interview_participants_table',1),(22,'2025_12_12_185918_create_employee_documents_table',1),(23,'2025_12_12_185925_create_employee_educations_table',1),(24,'2025_12_12_185932_create_employee_experiences_table',1),(25,'2025_12_13_053418_add_branch_id_to_employee_documents_table',1),(26,'2025_12_13_053421_add_branch_id_to_employee_educations_table',1),(27,'2025_12_13_053426_add_branch_id_to_employee_experiences_table',1),(28,'2025_12_13_053429_add_branch_id_to_candidate_documents_table',1),(29,'2025_12_13_053432_add_branch_id_to_candidate_educations_table',1),(30,'2025_12_13_053435_add_branch_id_to_candidate_experiences_table',1),(31,'2025_12_13_053437_add_branch_id_to_candidate_interviews_table',1),(32,'2025_12_13_053440_add_branch_id_to_candidate_interviewers_table',1),(33,'2025_12_13_053443_add_branch_id_to_candidate_interview_participants_table',1),(34,'2025_12_13_054250_remove_branch_id_from_candidate_documents_table',1),(35,'2025_12_13_054254_remove_branch_id_from_candidate_educations_table',1),(36,'2025_12_13_054257_remove_branch_id_from_candidate_experiences_table',1),(37,'2025_12_13_054301_remove_branch_id_from_candidate_interviews_table',1),(38,'2025_12_13_054306_remove_branch_id_from_candidate_interviewers_table',1),(39,'2025_12_13_054309_remove_branch_id_from_candidate_interview_participants_table',1),(40,'2025_12_13_064904_add_employee_id_and_branch_id_to_users_table',1),(41,'2025_12_13_075717_add_photo_path_to_employees_table',1),(42,'2025_12_19_015056_add_overtime_and_deduction_fields_to_employees_table',1),(43,'2025_12_19_021010_create_employee_allowances_deductions_table',1),(44,'2025_12_19_041715_create_test_table',1),(45,'2025_12_19_043007_add_country_and_currency_to_companies_table',1),(46,'2025_12_19_151258_add_two_stage_approval_to_leaves_table',1),(47,'2025_12_19_151313_create_leave_types_table',1),(48,'2025_12_19_180917_create_roles_table',1),(49,'2025_12_19_181005_create_permissions_table',1),(50,'2025_12_19_181011_create_user_roles_table',1),(51,'2025_12_19_181016_create_role_permissions_table',1),(52,'2026_02_23_182417_create_suppliers_table',1),(53,'2026_02_23_183840_create_inventory_items_table',1),(54,'2026_02_23_191655_create_vehicles_table',1),(55,'2026_02_23_194947_create_routes_table',1),(56,'2026_02_27_065440_create_loads_table',1),(57,'2026_02_27_081650_drop_total_value_from_loads_table',1),(58,'2026_02_27_082449_create_load_items_table',1),(59,'2026_03_01_145603_create_purchase_orders_table',1),(60,'2026_03_01_145617_create_purchase_order_items_table',1),(61,'2026_03_04_063523_create_goods_received_notes_table',1),(62,'2026_03_04_063539_create_grn_items_table',1),(63,'2026_03_04_072217_add_sell_and_purchase_price_to_inventory_items_table',1),(64,'2026_03_04_073057_add_pricing_and_expiry_to_grn_items_table',1),(65,'2026_03_05_000000_create_outlets_table',1),(66,'2026_03_05_010000_add_user_id_to_outlets_table',1),(67,'2026_03_05_020000_add_role_to_users_table',1),(68,'2026_03_05_030000_create_stock_transfers_table',1),(69,'2026_03_05_040000_add_transfer_reference_to_stock_transfers_table',1),(70,'2026_03_05_050000_create_distribution_customers_table',1),(71,'2026_03_05_051000_create_distribution_invoices_table',1),(72,'2026_03_05_052000_create_distribution_invoice_items_table',1),(73,'2026_03_05_053000_create_distribution_returns_table',1),(74,'2026_03_05_054000_create_distribution_payments_table',1),(75,'2026_03_05_055000_add_outstanding_to_distribution_customers_table',1),(76,'2026_03_05_056000_add_route_id_to_distribution_customers_table',1),(77,'2026_03_05_057000_add_settlement_fields_to_distribution_returns_table',1),(78,'2026_03_06_000000_add_sales_ref_id_to_loads_table',1),(79,'2026_03_12_120000_add_missing_load_id_columns_to_distribution_tables',1),(80,'2026_03_12_153000_add_discount_to_distribution_invoice_items_table',1),(81,'2026_03_16_000000_create_system_settings_table',1),(82,'2026_03_16_100000_add_logo_path_to_companies_table',1),(83,'2026_03_16_100000_create_outlet_sales_table',1),(84,'2026_03_16_100100_create_outlet_sale_items_table',1),(85,'2026_03_16_110000_create_outlet_cash_drawers_table',1),(86,'2026_03_16_120000_create_outlet_cash_drawer_sessions_table',1),(87,'2026_03_16_130000_create_outlet_loyalty_customers_table',1),(88,'2026_03_16_140000_add_loyalty_fields_to_outlet_sales_table',1),(89,'2026_03_16_150000_create_products_table',1),(90,'2026_03_16_150100_create_raw_materials_table',1),(91,'2026_03_16_150200_create_bom_headers_table',1),(92,'2026_03_16_150300_create_bom_items_table',1),(93,'2026_03_16_150400_create_production_orders_table',1),(94,'2026_03_17_080000_create_production_plans_table',1),(95,'2026_03_17_090000_add_execution_fields_to_production_orders_table',1),(96,'2026_03_17_100000_create_qc_inspections_table',1),(97,'2026_03_17_110000_create_packaging_batches_table',1),(98,'2026_03_17_120000_add_main_store_fields_to_packaging_batches_table',1),(99,'2026_03_16_150000_add_payment_fields_to_outlet_sales_table',2),(100,'2026_03_16_160000_add_issue_type_and_discount_to_outlet_sale_items_table',2),(101,'2026_04_18_000001_create_petty_cash_transactions_table',2),(102,'2026_04_18_000002_create_delivery_cash_transactions_table',2),(103,'2026_04_18_000003_create_main_cash_transactions_table',2),(104,'2026_04_18_000004_add_epf_etf_contributions_to_employees_table',2),(105,'2026_04_18_000005_add_tax_fields_to_employees_table',2),(106,'2026_04_18_000006_add_payment_fields_to_goods_received_notes_table',2),(107,'2026_04_18_000007_add_payment_option_fields_to_goods_received_notes_table',2),(108,'2026_04_18_120000_add_accounting_balances_to_companies_table',2),(109,'2026_04_18_130000_add_bank_details_to_companies_table',2),(110,'2026_04_18_140000_create_company_bank_accounts_table',2),(111,'2026_04_18_140100_create_company_cheque_accounts_table',2),(112,'2026_04_19_000008_create_cheque_registry_entries_table',2),(113,'2026_04_19_000009_add_cheque_date_to_distribution_payments_table',2),(114,'2026_04_19_000010_create_load_expenses_table',2),(115,'2026_04_21_100000_add_batch_no_to_production_orders_table',2),(116,'2026_04_21_101000_add_batch_tracking_to_packaging_batches_table',2);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `outlet_cash_drawer_sessions`
--

DROP TABLE IF EXISTS `outlet_cash_drawer_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `outlet_cash_drawer_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `outlet_id` bigint unsigned NOT NULL,
  `session_date` date NOT NULL,
  `opening_balance` decimal(14,2) NOT NULL,
  `opened_at` datetime NOT NULL,
  `opened_by` bigint unsigned DEFAULT NULL,
  `opening_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `closing_balance` decimal(14,2) DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `closed_by` bigint unsigned DEFAULT NULL,
  `closing_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `outlet_cash_drawer_sessions_outlet_id_session_date_unique` (`outlet_id`,`session_date`),
  KEY `outlet_cash_drawer_sessions_opened_by_foreign` (`opened_by`),
  KEY `outlet_cash_drawer_sessions_closed_by_foreign` (`closed_by`),
  KEY `outlet_cash_drawer_sessions_outlet_id_status_index` (`outlet_id`,`status`),
  CONSTRAINT `outlet_cash_drawer_sessions_closed_by_foreign` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `outlet_cash_drawer_sessions_opened_by_foreign` FOREIGN KEY (`opened_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `outlet_cash_drawer_sessions_outlet_id_foreign` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outlet_cash_drawer_sessions`
--

LOCK TABLES `outlet_cash_drawer_sessions` WRITE;
/*!40000 ALTER TABLE `outlet_cash_drawer_sessions` DISABLE KEYS */;
INSERT INTO `outlet_cash_drawer_sessions` VALUES (1,3,'2026-03-16',28180.00,'2026-03-16 12:00:25',5,'2026/03/16',NULL,NULL,NULL,NULL,'open','2026-03-16 06:30:25','2026-03-16 06:30:25');
/*!40000 ALTER TABLE `outlet_cash_drawer_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `outlet_cash_drawers`
--

DROP TABLE IF EXISTS `outlet_cash_drawers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `outlet_cash_drawers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `outlet_id` bigint unsigned NOT NULL,
  `balance` decimal(14,2) NOT NULL DEFAULT '0.00',
  `last_set_by` bigint unsigned DEFAULT NULL,
  `last_set_at` datetime DEFAULT NULL,
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `outlet_cash_drawers_outlet_id_unique` (`outlet_id`),
  KEY `outlet_cash_drawers_last_set_by_foreign` (`last_set_by`),
  KEY `outlet_cash_drawers_last_set_at_index` (`last_set_at`),
  CONSTRAINT `outlet_cash_drawers_last_set_by_foreign` FOREIGN KEY (`last_set_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `outlet_cash_drawers_outlet_id_foreign` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outlet_cash_drawers`
--

LOCK TABLES `outlet_cash_drawers` WRITE;
/*!40000 ALTER TABLE `outlet_cash_drawers` DISABLE KEYS */;
INSERT INTO `outlet_cash_drawers` VALUES (1,3,28180.00,5,'2026-03-16 12:00:25','2026/03/16','2026-03-16 06:30:25','2026-03-16 06:30:25');
/*!40000 ALTER TABLE `outlet_cash_drawers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `outlet_loyalty_customers`
--

DROP TABLE IF EXISTS `outlet_loyalty_customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `outlet_loyalty_customers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `outlet_id` bigint unsigned NOT NULL,
  `customer_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `birthday` date DEFAULT NULL,
  `points_balance` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_visits` int unsigned NOT NULL DEFAULT '0',
  `total_spent` decimal(14,2) NOT NULL DEFAULT '0.00',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `notes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `outlet_loyalty_customers_outlet_id_customer_code_unique` (`outlet_id`,`customer_code`),
  UNIQUE KEY `outlet_loyalty_customers_outlet_id_phone_unique` (`outlet_id`,`phone`),
  KEY `outlet_loyalty_customers_created_by_foreign` (`created_by`),
  KEY `outlet_loyalty_customers_outlet_id_status_index` (`outlet_id`,`status`),
  CONSTRAINT `outlet_loyalty_customers_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `outlet_loyalty_customers_outlet_id_foreign` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outlet_loyalty_customers`
--

LOCK TABLES `outlet_loyalty_customers` WRITE;
/*!40000 ALTER TABLE `outlet_loyalty_customers` DISABLE KEYS */;
INSERT INTO `outlet_loyalty_customers` VALUES (1,3,'LC-001-0001','Shashika Nuwan','0712323221','shashikanuwan@gmail.com','2026-03-16',0.00,0,0.00,'active',NULL,5,'2026-03-16 06:50:25','2026-03-16 06:50:25');
/*!40000 ALTER TABLE `outlet_loyalty_customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `outlet_sale_items`
--

DROP TABLE IF EXISTS `outlet_sale_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `outlet_sale_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `outlet_sale_id` bigint unsigned NOT NULL,
  `inventory_item_id` bigint unsigned NOT NULL,
  `item_code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `issue_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'retail',
  `discount_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `quantity` decimal(12,2) NOT NULL,
  `unit_price` decimal(14,2) NOT NULL,
  `line_total` decimal(14,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `outlet_sale_items_inventory_item_id_foreign` (`inventory_item_id`),
  KEY `outlet_sale_items_outlet_sale_id_inventory_item_id_index` (`outlet_sale_id`,`inventory_item_id`),
  CONSTRAINT `outlet_sale_items_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `outlet_sale_items_outlet_sale_id_foreign` FOREIGN KEY (`outlet_sale_id`) REFERENCES `outlet_sales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outlet_sale_items`
--

LOCK TABLES `outlet_sale_items` WRITE;
/*!40000 ALTER TABLE `outlet_sale_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `outlet_sale_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `outlet_sales`
--

DROP TABLE IF EXISTS `outlet_sales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `outlet_sales` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sale_number` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `outlet_id` bigint unsigned NOT NULL,
  `sold_by` bigint unsigned DEFAULT NULL,
  `sale_date` datetime NOT NULL,
  `customer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `loyalty_customer_id` bigint unsigned DEFAULT NULL,
  `total_quantity` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `discount_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `paid_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `payment_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  `balance_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `loyalty_points_awarded` decimal(14,2) NOT NULL DEFAULT '0.00',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `outlet_sales_sale_number_unique` (`sale_number`),
  KEY `outlet_sales_sold_by_foreign` (`sold_by`),
  KEY `outlet_sales_outlet_id_sale_date_index` (`outlet_id`,`sale_date`),
  KEY `outlet_sales_loyalty_customer_id_foreign` (`loyalty_customer_id`),
  CONSTRAINT `outlet_sales_loyalty_customer_id_foreign` FOREIGN KEY (`loyalty_customer_id`) REFERENCES `outlet_loyalty_customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `outlet_sales_outlet_id_foreign` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `outlet_sales_sold_by_foreign` FOREIGN KEY (`sold_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outlet_sales`
--

LOCK TABLES `outlet_sales` WRITE;
/*!40000 ALTER TABLE `outlet_sales` DISABLE KEYS */;
INSERT INTO `outlet_sales` VALUES (1,'OPS20260316111800B588',3,5,'2026-03-16 11:16:00','Akalanka Imesh',NULL,1.00,28000.00,0.00,0.00,'cash',0.00,0.00,NULL,'2026-03-16 05:48:00','2026-03-16 05:48:00'),(2,'OPS2026031611290903F1',3,5,'2026-03-16 11:28:00','Udara Madumal',NULL,1.00,60.00,0.00,0.00,'cash',0.00,0.00,NULL,'2026-03-16 05:59:09','2026-03-16 05:59:09'),(3,'OPS20260316113443E87D',3,5,'2026-03-16 11:34:00','Akalanka Imesh',NULL,1.00,60.00,0.00,0.00,'cash',0.00,0.00,NULL,'2026-03-16 06:04:43','2026-03-16 06:04:43'),(4,'OPS2026031611362223B4',3,5,'2026-03-16 11:35:00','Akalanka Imesh',NULL,1.00,60.00,0.00,0.00,'cash',0.00,0.00,NULL,'2026-03-16 06:06:22','2026-03-16 06:06:22'),(5,'OPS20260316124736C968',3,5,'2026-03-16 12:47:00',NULL,NULL,1.00,28000.00,0.00,0.00,'cash',0.00,0.00,NULL,'2026-03-16 07:17:36','2026-03-16 07:17:36');
/*!40000 ALTER TABLE `outlet_sales` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `outlets`
--

DROP TABLE IF EXISTS `outlets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `outlets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `manager_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `user_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `outlets_code_unique` (`code`),
  KEY `outlets_user_id_foreign` (`user_id`),
  CONSTRAINT `outlets_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outlets`
--

LOCK TABLES `outlets` WRITE;
/*!40000 ALTER TABLE `outlets` DISABLE KEYS */;
INSERT INTO `outlets` VALUES (3,'Factory Outlet One','001','Sameera Chathuranga','factoryone@gmail.com','0715522556','Parakaduwa','active',5,'2026-03-04 23:56:13','2026-03-04 23:56:13');
/*!40000 ALTER TABLE `outlets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `packaging_batches`
--

DROP TABLE IF EXISTS `packaging_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `packaging_batches` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `qc_inspection_id` bigint unsigned NOT NULL,
  `production_order_id` bigint unsigned NOT NULL,
  `batch_no` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `packaging_material_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `packaging_material_quantity` decimal(15,3) NOT NULL DEFAULT '0.000',
  `packaging_material_unit` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pcs',
  `packed_quantity` decimal(15,3) NOT NULL DEFAULT '0.000',
  `unit_price` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status` enum('planned','packed','dispatched') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planned',
  `label_code` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `barcode_value` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qr_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `packed_at` timestamp NULL DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `main_store_synced_at` timestamp NULL DEFAULT NULL,
  `main_store_synced_quantity` decimal(15,3) NOT NULL DEFAULT '0.000',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `packaging_batches_label_code_unique` (`label_code`),
  KEY `packaging_batches_qc_inspection_id_foreign` (`qc_inspection_id`),
  KEY `packaging_batches_production_order_id_foreign` (`production_order_id`),
  KEY `packaging_batches_status_packed_at_index` (`status`,`packed_at`),
  KEY `packaging_batches_main_store_synced_at_index` (`main_store_synced_at`),
  KEY `packaging_batches_batch_no_index` (`batch_no`),
  KEY `packaging_batches_expiry_date_index` (`expiry_date`),
  CONSTRAINT `packaging_batches_production_order_id_foreign` FOREIGN KEY (`production_order_id`) REFERENCES `production_orders` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `packaging_batches_qc_inspection_id_foreign` FOREIGN KEY (`qc_inspection_id`) REFERENCES `qc_inspections` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `packaging_batches`
--

LOCK TABLES `packaging_batches` WRITE;
/*!40000 ALTER TABLE `packaging_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `packaging_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_reset_tokens`
--

DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_reset_tokens`
--

LOCK TABLES `password_reset_tokens` WRITE;
/*!40000 ALTER TABLE `password_reset_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_reset_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payrolls`
--

DROP TABLE IF EXISTS `payrolls`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payrolls` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `employee_id` bigint unsigned NOT NULL,
  `month_year` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `basic_salary` decimal(10,2) NOT NULL,
  `allowances` decimal(10,2) NOT NULL DEFAULT '0.00',
  `deductions` decimal(10,2) NOT NULL DEFAULT '0.00',
  `net_salary` decimal(10,2) NOT NULL,
  `working_days` int NOT NULL,
  `present_days` int NOT NULL,
  `absent_days` int NOT NULL,
  `overtime_hours` decimal(5,2) NOT NULL DEFAULT '0.00',
  `overtime_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` enum('pending','processed','paid') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `processed_at` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payrolls_employee_id_month_year_unique` (`employee_id`,`month_year`),
  KEY `payrolls_tenant_id_foreign` (`tenant_id`),
  KEY `payrolls_branch_id_foreign` (`branch_id`),
  CONSTRAINT `payrolls_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `payrolls_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`),
  CONSTRAINT `payrolls_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payrolls`
--

LOCK TABLES `payrolls` WRITE;
/*!40000 ALTER TABLE `payrolls` DISABLE KEYS */;
/*!40000 ALTER TABLE `payrolls` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `permissions_name_unique` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=46 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES (1,'view_users','User Management','View users',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(2,'create_users','User Management','Create users',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(3,'edit_users','User Management','Edit users',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(4,'delete_users','User Management','Delete users',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(5,'view_employees','Employee Management','View employees',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(6,'create_employees','Employee Management','Create employees',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(7,'edit_employees','Employee Management','Edit employees',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(8,'delete_employees','Employee Management','Delete employees',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(9,'view_departments','Department Management','View departments',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(10,'create_departments','Department Management','Create departments',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(11,'edit_departments','Department Management','Edit departments',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(12,'delete_departments','Department Management','Delete departments',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(13,'view_attendance','Attendance Management','View attendance records',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(14,'create_attendance','Attendance Management','Create attendance records',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(15,'edit_attendance','Attendance Management','Edit attendance records',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(16,'delete_attendance','Attendance Management','Delete attendance records',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(17,'view_leaves','Leave Management','View leave requests',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(18,'create_leaves','Leave Management','Create leave requests',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(19,'approve_leaves','Leave Management','Approve leave requests',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(20,'reject_leaves','Leave Management','Reject leave requests',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(21,'view_payrolls','Payroll Management','View payroll records',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(22,'create_payrolls','Payroll Management','Create payroll records',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(23,'edit_payrolls','Payroll Management','Edit payroll records',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(24,'delete_payrolls','Payroll Management','Delete payroll records',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(25,'view_candidates','Candidate Management','View candidates',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(26,'create_candidates','Candidate Management','Create candidates',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(27,'edit_candidates','Candidate Management','Edit candidates',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(28,'delete_candidates','Candidate Management','Delete candidates',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(29,'view_roles','Role Management','View roles',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(30,'create_roles','Role Management','Create roles',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(31,'edit_roles','Role Management','Edit roles',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(32,'delete_roles','Role Management','Delete roles',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(33,'assign_roles','Role Management','Assign roles to users',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(34,'view_permissions','Permission Management','View permissions',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(35,'create_permissions','Permission Management','Create permissions',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(36,'edit_permissions','Permission Management','Edit permissions',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(37,'delete_permissions','Permission Management','Delete permissions',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(38,'distribution_view_customers','Distribution','View Customers',1,'2026-03-12 15:06:14','2026-03-12 15:06:14'),(39,'distribution_manage_customers','Distribution','Manage Customers',1,'2026-03-12 15:06:14','2026-03-12 15:06:14'),(40,'distribution_create_invoices','Distribution','Create Invoices',1,'2026-03-12 15:06:15','2026-03-12 15:06:15'),(41,'distribution_view_invoices','Distribution','View Invoices',1,'2026-03-12 15:06:15','2026-03-12 15:06:15'),(42,'distribution_manage_returns','Distribution','Manage Returns',1,'2026-03-12 15:06:16','2026-03-12 15:06:16'),(43,'distribution_record_payments','Distribution','Record Payments',1,'2026-03-12 15:06:16','2026-03-12 15:06:16'),(44,'distribution_view_customer_ledger','Distribution','View Customer Ledger',1,'2026-03-12 15:06:17','2026-03-12 15:06:17'),(45,'distribution_view_debtors','Distribution','View Debtors',1,'2026-03-12 15:06:17','2026-03-12 15:06:17');
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `personal_access_tokens`
--

DROP TABLE IF EXISTS `personal_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `personal_access_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tokenable_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenable_id` bigint unsigned NOT NULL,
  `name` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `abilities` text COLLATE utf8mb4_unicode_ci,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `personal_access_tokens_token_unique` (`token`),
  KEY `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`,`tokenable_id`),
  KEY `personal_access_tokens_expires_at_index` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `personal_access_tokens`
--

LOCK TABLES `personal_access_tokens` WRITE;
/*!40000 ALTER TABLE `personal_access_tokens` DISABLE KEYS */;
INSERT INTO `personal_access_tokens` VALUES (1,'App\\Models\\User',2,'API Token','da8ec2cc91d22b064647baff44ae803b398a4152ef3637c8d2425117d405d99c','[\"*\"]','2026-02-23 14:52:47',NULL,'2026-02-22 23:26:47','2026-02-23 14:52:47'),(2,'App\\Models\\User',2,'API Token','52fe8da6289a77321b21c9d878407c6d456787dd66652d959073c5bdfd33257a','[\"*\"]','2026-02-27 05:26:48',NULL,'2026-02-27 01:18:12','2026-02-27 05:26:48'),(3,'App\\Models\\User',2,'API Token','c91bc0b2b6d3ab5d994cb5b7c0177850dd9d5a0397ee3843ad426dd14e99a9ef','[\"*\"]','2026-03-01 10:27:39',NULL,'2026-03-01 08:55:35','2026-03-01 10:27:39'),(4,'App\\Models\\User',2,'API Token','28881dedbc0c922264cd89975407cce57b6b652dd865fa5e831f41ecc9af9baa','[\"*\"]','2026-03-04 02:52:15',NULL,'2026-03-03 23:31:33','2026-03-04 02:52:15'),(5,'App\\Models\\User',2,'API Token','0ec820b80a31967720a566eebd95bb904528f3edefd89137d84e26bc181d8838','[\"*\"]','2026-03-04 22:50:34',NULL,'2026-03-04 05:51:56','2026-03-04 22:50:34'),(6,'App\\Models\\User',2,'API Token','9da5e18d2ab48be7e76c31d92d567e2bf031b21e1bbd0f0abddeddc7621168a3','[\"*\"]','2026-03-05 22:47:10',NULL,'2026-03-04 22:54:39','2026-03-05 22:47:10'),(7,'App\\Models\\User',2,'API Token','0f597ecb1698471f754646c6e4c8aa13e8359c2a0907b9415f2511ad551b50f1','[\"*\"]','2026-03-09 02:40:17',NULL,'2026-03-08 22:21:30','2026-03-09 02:40:17'),(8,'App\\Models\\User',2,'API Token','7c266336a2cca8761e6347a9bc98a5207e3079eabde77595992aca285de22000','[\"*\"]','2026-03-09 12:12:53',NULL,'2026-03-09 11:58:21','2026-03-09 12:12:53'),(9,'App\\Models\\User',2,'API Token','715594ca36ce4c31659cee5ef89b23639e35bf1ec35d84d0035d3f36e133d8e3','[\"*\"]','2026-03-09 12:47:40',NULL,'2026-03-09 12:21:37','2026-03-09 12:47:40'),(10,'App\\Models\\User',7,'API Token','17ffad9f4656711b8125d968fcf906fd36cf610b4ed65e5e58d14e37586fa4f7','[\"*\"]','2026-03-09 12:48:44',NULL,'2026-03-09 12:47:58','2026-03-09 12:48:44'),(11,'App\\Models\\User',6,'API Token','b6263df6af9450898cfb8531988d38763efec494a1465b883cbed3aeda1144df','[\"*\"]','2026-03-09 13:07:46',NULL,'2026-03-09 12:48:54','2026-03-09 13:07:46'),(12,'App\\Models\\User',2,'API Token','f9f589bb96dc9c883c2d7e0f2bb7868d156c8039bf6d8af7fcc9833d738c0ce8','[\"*\"]','2026-03-09 13:20:12',NULL,'2026-03-09 13:08:09','2026-03-09 13:20:12'),(13,'App\\Models\\User',6,'API Token','5d10c39821b53c98ebf01b8d24edffc1b99f5124cca40cd6654a147285e9ce46','[\"*\"]','2026-03-10 01:26:26',NULL,'2026-03-09 13:22:34','2026-03-10 01:26:26'),(14,'App\\Models\\User',6,'API Token','c848306dfc9faee5172d798a8c2ad2eae285e24ac87ecf7e25a9c67f8e74858e','[\"*\"]','2026-03-10 04:43:44',NULL,'2026-03-10 01:28:13','2026-03-10 04:43:44'),(15,'App\\Models\\User',6,'API Token','a023e9d3dc27246e536146ed75e0a2b856cd546d51563373193ed28394d776fb','[\"*\"]','2026-03-10 22:40:17',NULL,'2026-03-10 21:31:35','2026-03-10 22:40:17'),(16,'App\\Models\\User',6,'API Token','44b26be10fea3f844e3fcc46aecd50408984cfb386db9947329020bfbd08cd18','[\"*\"]','2026-03-10 23:38:48',NULL,'2026-03-10 22:41:32','2026-03-10 23:38:48'),(17,'App\\Models\\User',6,'API Token','d96efac0d8b3f0d1d50dc446e7ce2589259344e74c5a564677d704aaa325a1f0','[\"*\"]','2026-03-12 00:29:43',NULL,'2026-03-12 00:10:31','2026-03-12 00:29:43'),(18,'App\\Models\\User',6,'API Token','920c4ae6be95108d5d8c736d96c8ff3a62452ff013bf4c183edd8745e6b13f27','[\"*\"]','2026-03-12 01:19:31',NULL,'2026-03-12 00:30:41','2026-03-12 01:19:31'),(19,'App\\Models\\User',6,'API Token','4d844b88cc0e16879dbe6256bb80b04345c0582fef6b830d181c472996d0956f','[\"*\"]','2026-03-12 03:54:08',NULL,'2026-03-12 01:19:46','2026-03-12 03:54:08'),(20,'App\\Models\\User',6,'API Token','3ec09e3cc7c50b1ca59030fb9446afa08160695601beea415a2c05e698be45bd','[\"*\"]','2026-03-12 04:18:01',NULL,'2026-03-12 03:54:24','2026-03-12 04:18:01'),(21,'App\\Models\\User',6,'API Token','16dff80627bd883b3a401f07c7cadf9486ccb0c5179fcf42c8087912b71d00c2','[\"*\"]','2026-03-12 04:25:57',NULL,'2026-03-12 04:18:47','2026-03-12 04:25:57'),(22,'App\\Models\\User',6,'API Token','52ad78b5780da203fb29386d51d7fd935f5bf32f5d565438893d21681585cf16','[\"*\"]','2026-03-12 05:25:21',NULL,'2026-03-12 04:26:47','2026-03-12 05:25:21'),(23,'App\\Models\\User',6,'API Token','da2bff2b39f7d8628c318b01b2f56c948c4ac236842746218184a3dd6e008b9d','[\"*\"]','2026-03-12 05:43:53',NULL,'2026-03-12 05:25:43','2026-03-12 05:43:53'),(24,'App\\Models\\User',6,'API Token','69a877fbee4beb18cbdce50852ff828c68ec5baf9faf34462e6474e39a31070c','[\"*\"]','2026-03-12 13:22:17',NULL,'2026-03-12 05:50:38','2026-03-12 13:22:17'),(25,'App\\Models\\User',2,'API Token','944992dd794cd20991cd53cde5f9a3a4a439209afa61d156878d4cebd946d8ec','[\"*\"]','2026-03-12 15:02:58',NULL,'2026-03-12 13:23:30','2026-03-12 15:02:58'),(26,'App\\Models\\User',2,'API Token','89476bf0336fadb8ac95cf00d9b5d39ef1659f54de1b57acc1c420c34117a30d','[\"*\"]','2026-03-12 15:06:23',NULL,'2026-03-12 15:03:34','2026-03-12 15:06:23'),(27,'App\\Models\\User',6,'API Token','5084a57c06ff9eb6791d27c015ac8180fc33d70c5011d15f7599e9d16e6f9448','[\"*\"]','2026-03-12 15:06:42',NULL,'2026-03-12 15:06:41','2026-03-12 15:06:42'),(28,'App\\Models\\User',2,'API Token','087988a58f6990e9eb3f7bf93c0cf2072c2c581bf87254fca827630554e955fd','[\"*\"]','2026-03-12 15:17:42',NULL,'2026-03-12 15:13:33','2026-03-12 15:17:42'),(29,'App\\Models\\User',6,'API Token','b95d57004ef4a726715e0e782d9105e1560016f92bd18b4651a75d105ce4d556','[\"*\"]','2026-03-12 15:17:59',NULL,'2026-03-12 15:17:58','2026-03-12 15:17:59'),(30,'App\\Models\\User',6,'API Token','798fcf08d3df0b76ca93a5d559e9475f629e1fb6b6603d77af789d625ce235aa','[\"*\"]','2026-03-12 15:43:27',NULL,'2026-03-12 15:26:35','2026-03-12 15:43:27'),(31,'App\\Models\\User',2,'API Token','60d86e6c773ec064d540c7a68da623d4802a0633ee6355592608dedaa7763a71','[\"*\"]','2026-03-12 15:47:59',NULL,'2026-03-12 15:44:14','2026-03-12 15:47:59'),(32,'App\\Models\\User',6,'API Token','4e1da0c4d461ed3cb018966cce0dc7bd7fdfe40a3c3326dc19032b1cd2761d24','[\"*\"]','2026-03-14 02:19:37',NULL,'2026-03-14 02:02:25','2026-03-14 02:19:37'),(33,'App\\Models\\User',2,'API Token','75290a9d48691a60beaf72ae69541c0b422d8868040cdab66dfa1d259eda28c4','[\"*\"]','2026-03-14 02:22:05',NULL,'2026-03-14 02:20:31','2026-03-14 02:22:05'),(34,'App\\Models\\User',6,'API Token','676490efb1e5b1ef43f1e1a61d531c73410fe924f00c9e625edb022989d5f9b9','[\"*\"]','2026-03-14 02:22:39',NULL,'2026-03-14 02:22:18','2026-03-14 02:22:39'),(35,'App\\Models\\User',2,'API Token','d641a79cd63e538c0741f822392495c201a9408c6acc19803345374e98058521','[\"*\"]','2026-03-14 04:29:05',NULL,'2026-03-14 02:23:05','2026-03-14 04:29:05'),(36,'App\\Models\\User',2,'API Token','f8dbd4d5967cfd9a73a2ad5f2be1d298213d9eb67f82e5bebe7d1952062d5efd','[\"*\"]','2026-03-17 00:29:09',NULL,'2026-03-14 06:11:14','2026-03-17 00:29:09'),(37,'App\\Models\\User',5,'API Token','1b1217c76edde55e99aa64a78e507f5cc29068f625e3b6ebd0182cb8e2657576','[\"*\"]','2026-03-16 04:53:34',NULL,'2026-03-16 04:46:06','2026-03-16 04:53:34'),(38,'App\\Models\\User',5,'API Token','435c9d4c5a02cb5ace2509dfc6d1224f6dcf6acad2e0e461e5fa4f4d79f865ae','[\"*\"]','2026-03-16 04:58:21',NULL,'2026-03-16 04:54:08','2026-03-16 04:58:21'),(39,'App\\Models\\User',5,'API Token','7425bace53bc70d7a192df63515ae2781b68ded3ecbf1343ec215d92dd0bad2d','[\"*\"]','2026-03-16 06:05:09',NULL,'2026-03-16 04:59:04','2026-03-16 06:05:09'),(41,'App\\Models\\User',5,'API Token','c71c7d18159fe32590ec91b7b985940173ffaeeaf26298a527460243d9e56d2f','[\"*\"]','2026-03-16 23:42:48',NULL,'2026-03-16 06:05:43','2026-03-16 23:42:48'),(42,'App\\Models\\User',2,'API Token','a77a5791bbedb7fcb73d192871a637d0ae393d71e23286c216a6d12e007bdfbd','[\"*\"]','2026-03-17 06:26:26',NULL,'2026-03-17 06:26:04','2026-03-17 06:26:26'),(43,'App\\Models\\User',6,'API Token','36fa478f060c9c549bf4e43b8228ea1ad1a6a69b61a6a7c42da18b04e469d4f6','[\"*\"]','2026-03-17 06:48:07',NULL,'2026-03-17 06:30:10','2026-03-17 06:48:07'),(44,'App\\Models\\User',6,'API Token','d93974167aa139bbaf5c0d064dacb37f37bce4ea108c6032f362abe427fd3cd2','[\"*\"]','2026-03-17 06:50:00',NULL,'2026-03-17 06:49:21','2026-03-17 06:50:00'),(45,'App\\Models\\User',6,'API Token','df98e2fdbb517a28cc3fadbeec77a4caea19811b7ce974ac0cd920e9bbd85beb','[\"*\"]','2026-03-17 06:52:50',NULL,'2026-03-17 06:51:30','2026-03-17 06:52:50'),(46,'App\\Models\\User',2,'API Token','387f8ebb2da5b17ee22b4bd9f87159a5693b263681aaa5552edbbbe7f918838b','[\"*\"]','2026-03-17 07:05:12',NULL,'2026-03-17 06:57:22','2026-03-17 07:05:12'),(47,'App\\Models\\User',2,'API Token','efe9e212fbee999059388904cb6c5fc1a70f6f8c9c6be7778d873cc0f4ea4349','[\"*\"]','2026-03-17 07:13:49',NULL,'2026-03-17 07:07:24','2026-03-17 07:13:49'),(48,'App\\Models\\User',2,'API Token','1ffb42f6869384a7ce5d0989a25b1d03a4469f359f8d3d7c1caf449c0a0330a3','[\"*\"]','2026-03-17 17:27:54',NULL,'2026-03-17 12:54:34','2026-03-17 17:27:54'),(49,'App\\Models\\User',2,'API Token','a91ca6e46978095cc451542514e49d1e5aee60211f6f733a89941db6b254dcde','[\"*\"]','2026-03-17 13:35:58',NULL,'2026-03-17 13:00:19','2026-03-17 13:35:58'),(50,'App\\Models\\User',2,'API Token','c034f18c7569a22e6fece6abcc049d1d46f926ed895539c833d6a38b3259df7a','[\"*\"]','2026-03-17 13:35:55',NULL,'2026-03-17 13:35:08','2026-03-17 13:35:55'),(51,'App\\Models\\User',2,'API Token','3054775102762e819a245308d74ca11706423260e459bb33a845d40445997eb8','[\"*\"]','2026-03-17 14:11:03',NULL,'2026-03-17 14:11:01','2026-03-17 14:11:03'),(52,'App\\Models\\User',2,'API Token','4b455d8bc357fc00270e0232c24c2d75653b7bd5233304fe382f85aa49c78131','[\"*\"]','2026-03-17 15:02:58',NULL,'2026-03-17 14:12:19','2026-03-17 15:02:58'),(53,'App\\Models\\User',6,'API Token','289c32fdd2ab5c400f3a2d0b07ba80c96e04ce2a6f33133bf8290ef153396b7d','[\"*\"]','2026-03-18 03:13:14',NULL,'2026-03-17 15:07:13','2026-03-18 03:13:14'),(54,'App\\Models\\User',2,'API Token','64b69fb58c829c6562387e46a3dc6718897a633fc698845ed1c21b28be501e75','[\"*\"]','2026-03-17 15:29:21',NULL,'2026-03-17 15:23:36','2026-03-17 15:29:21'),(55,'App\\Models\\User',2,'API Token','728b94823e03cb124e10916be4cdd9f3e0ffdf0fdde48fee5270b84782851ca8','[\"*\"]','2026-03-18 10:11:09',NULL,'2026-03-18 09:47:17','2026-03-18 10:11:09'),(56,'App\\Models\\User',2,'API Token','4e5b126c96c4f052218303179a692a409e285c0f8aec4cccf58750bfc7ec1b7e','[\"*\"]','2026-03-23 02:32:20',NULL,'2026-03-22 08:48:23','2026-03-23 02:32:20'),(57,'App\\Models\\User',2,'API Token','164f6724a23a49968af423abf9b5d33fa4c329b1fdaaf5dbda55ea024b2f91cd','[\"*\"]','2026-03-24 07:02:41',NULL,'2026-03-24 07:01:22','2026-03-24 07:02:41'),(58,'App\\Models\\User',2,'API Token','f3280df8bda77acb23939abb19384ab9ea407c3cac0c30b436fb534b61e4187a','[\"*\"]','2026-03-27 05:06:12',NULL,'2026-03-27 04:40:18','2026-03-27 05:06:12'),(59,'App\\Models\\User',2,'API Token','daa872acf18b36b786d2a626e44eb9942956f7923b67f9fd12e62534594b1311','[\"*\"]','2026-04-01 09:12:18',NULL,'2026-04-01 09:06:02','2026-04-01 09:12:18'),(60,'App\\Models\\User',2,'API Token','455bc4ba4784291283566ed400b7febcac4b761b2a409139e3054bef7d0eacc2','[\"*\"]','2026-04-02 13:48:29',NULL,'2026-04-02 13:47:40','2026-04-02 13:48:29'),(61,'App\\Models\\User',2,'API Token','99e22bad24a3923338525dbbd82bfd18b61ecfbfd5703d4fafd86511f2886092','[\"*\"]','2026-04-04 15:14:16',NULL,'2026-04-04 15:14:15','2026-04-04 15:14:16'),(62,'App\\Models\\User',2,'API Token','a30b64f5aaa988b60f5deed0bb2ceb248e51f1dd15f1c2d6033af1df74dd9716','[\"*\"]','2026-04-06 08:33:08',NULL,'2026-04-06 07:14:37','2026-04-06 08:33:08');
/*!40000 ALTER TABLE `personal_access_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `petty_cash_transactions`
--

DROP TABLE IF EXISTS `petty_cash_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `petty_cash_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `type` enum('in','out') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `petty_cash_transactions_created_by_foreign` (`created_by`),
  CONSTRAINT `petty_cash_transactions_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `petty_cash_transactions`
--

LOCK TABLES `petty_cash_transactions` WRITE;
/*!40000 ALTER TABLE `petty_cash_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `petty_cash_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `production_orders`
--

DROP TABLE IF EXISTS `production_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `production_plan_id` bigint unsigned DEFAULT NULL,
  `batch_no` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_id` bigint unsigned NOT NULL,
  `bom_id` bigint unsigned NOT NULL,
  `production_quantity` decimal(15,3) NOT NULL,
  `produced_quantity` decimal(15,3) NOT NULL DEFAULT '0.000',
  `wastage_quantity` decimal(15,3) NOT NULL DEFAULT '0.000',
  `batch_size` decimal(15,3) NOT NULL,
  `multiplier` decimal(15,4) NOT NULL,
  `machine_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `workstation_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `worker_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('started','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'started',
  `material_requirements` json DEFAULT NULL,
  `actual_material_consumption` json DEFAULT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `production_orders_product_id_foreign` (`product_id`),
  KEY `production_orders_bom_id_foreign` (`bom_id`),
  KEY `production_orders_production_plan_id_foreign` (`production_plan_id`),
  KEY `production_orders_batch_no_index` (`batch_no`),
  CONSTRAINT `production_orders_bom_id_foreign` FOREIGN KEY (`bom_id`) REFERENCES `bom_headers` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `production_orders_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `production_orders_production_plan_id_foreign` FOREIGN KEY (`production_plan_id`) REFERENCES `production_plans` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `production_orders`
--

LOCK TABLES `production_orders` WRITE;
/*!40000 ALTER TABLE `production_orders` DISABLE KEYS */;
INSERT INTO `production_orders` VALUES (3,2,NULL,4,3,1000.000,900.000,100.000,1000.000,1.0000,'Machine-01','WS-A','samanth','completed','[{\"unit\": \"kg\", \"material_id\": 3, \"material_code\": \"PO-SUGER\", \"material_name\": \"Suger\", \"available_after\": 47, \"available_before\": 49, \"inventory_item_id\": 4, \"required_quantity\": 2}, {\"unit\": \"kg\", \"material_id\": 4, \"material_code\": \"PO-WHITEFLO\", \"material_name\": \"White Flover\", \"available_after\": 98, \"available_before\": 100, \"inventory_item_id\": 5, \"required_quantity\": 2}]','[{\"unit\": \"kg\", \"material_id\": 3, \"material_code\": \"PO-SUGER\", \"material_name\": \"Suger\", \"available_after\": 47, \"available_before\": 49, \"inventory_item_id\": 4, \"required_quantity\": 2}, {\"unit\": \"kg\", \"material_id\": 4, \"material_code\": \"PO-WHITEFLO\", \"material_name\": \"White Flover\", \"available_after\": 98, \"available_before\": 100, \"inventory_item_id\": 5, \"required_quantity\": 2}]','2026-03-17 14:40:26','2026-03-17 14:41:20',NULL,'asd','2026-03-17 14:40:26','2026-03-17 14:41:20');
/*!40000 ALTER TABLE `production_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `production_plans`
--

DROP TABLE IF EXISTS `production_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_plans` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `bom_id` bigint unsigned DEFAULT NULL,
  `plan_date` date NOT NULL,
  `shift` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_quantity` decimal(15,3) NOT NULL,
  `batch_count` decimal(12,2) NOT NULL DEFAULT '1.00',
  `priority` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `status` enum('draft','scheduled','order_created','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `order_number` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `production_plans_product_id_foreign` (`product_id`),
  KEY `production_plans_bom_id_foreign` (`bom_id`),
  KEY `production_plans_created_by_foreign` (`created_by`),
  KEY `production_plans_plan_date_status_index` (`plan_date`,`status`),
  CONSTRAINT `production_plans_bom_id_foreign` FOREIGN KEY (`bom_id`) REFERENCES `bom_headers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `production_plans_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `production_plans_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `production_plans`
--

LOCK TABLES `production_plans` WRITE;
/*!40000 ALTER TABLE `production_plans` DISABLE KEYS */;
INSERT INTO `production_plans` VALUES (2,4,3,'2026-03-17','Morning',1000.000,1000.00,'medium','completed',NULL,NULL,2,'2026-03-17 14:39:08','2026-03-17 14:41:20');
/*!40000 ALTER TABLE `production_plans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pcs',
  `standard_batch_size` decimal(15,3) NOT NULL DEFAULT '1.000',
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `products_code_unique` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (3,'Milk Toffe','MILK-TOFFE','pcs',1000.000,NULL,'active','2026-03-17 00:27:43','2026-03-17 00:27:43'),(4,'Thala Kerali','THALA-KERALI','pcs',1000.000,NULL,'active','2026-03-17 14:35:35','2026-03-17 14:35:35'),(5,'Milk Topee','MILK-TOPEE','pcs',1000.000,NULL,'active','2026-03-27 04:47:21','2026-03-27 04:47:21');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_order_items`
--

DROP TABLE IF EXISTS `purchase_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_order_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `purchase_order_id` bigint unsigned NOT NULL,
  `inventory_item_id` bigint unsigned NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `total_price` decimal(15,2) NOT NULL,
  `received_quantity` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `purchase_order_items_purchase_order_id_foreign` (`purchase_order_id`),
  KEY `purchase_order_items_inventory_item_id_foreign` (`inventory_item_id`),
  CONSTRAINT `purchase_order_items_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `purchase_order_items_purchase_order_id_foreign` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_order_items`
--

LOCK TABLES `purchase_order_items` WRITE;
/*!40000 ALTER TABLE `purchase_order_items` DISABLE KEYS */;
INSERT INTO `purchase_order_items` VALUES (3,9,3,10.00,500.00,5000.00,10.00,'2026-03-17 00:18:34','2026-03-17 00:20:23'),(4,9,4,50.00,138.00,6900.00,50.00,'2026-03-17 00:18:34','2026-03-17 00:20:23'),(5,9,5,100.00,210.00,21000.00,100.00,'2026-03-17 00:18:34','2026-03-17 00:20:23');
/*!40000 ALTER TABLE `purchase_order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_orders`
--

DROP TABLE IF EXISTS `purchase_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_id` bigint unsigned NOT NULL,
  `order_date` date NOT NULL,
  `expected_delivery_date` date DEFAULT NULL,
  `status` enum('pending','approved','received','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `total_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_orders_order_number_unique` (`order_number`),
  KEY `purchase_orders_supplier_id_foreign` (`supplier_id`),
  CONSTRAINT `purchase_orders_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_orders`
--

LOCK TABLES `purchase_orders` WRITE;
/*!40000 ALTER TABLE `purchase_orders` DISABLE KEYS */;
INSERT INTO `purchase_orders` VALUES (9,'PO20260001',1,'2026-03-17','2026-03-17','pending',32900.00,NULL,'2026-03-17 00:18:34','2026-03-17 00:18:34');
/*!40000 ALTER TABLE `purchase_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `qc_inspections`
--

DROP TABLE IF EXISTS `qc_inspections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qc_inspections` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `production_order_id` bigint unsigned NOT NULL,
  `inspection_date` date NOT NULL,
  `inspector_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quality_status` enum('approved','rejected','hold') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'hold',
  `approved_quantity` decimal(15,3) NOT NULL DEFAULT '0.000',
  `rejected_quantity` decimal(15,3) NOT NULL DEFAULT '0.000',
  `food_safety_checklist` json DEFAULT NULL,
  `defects_notes` text COLLATE utf8mb4_unicode_ci,
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `report_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `qc_inspections_production_order_id_foreign` (`production_order_id`),
  KEY `qc_inspections_inspection_date_quality_status_index` (`inspection_date`,`quality_status`),
  CONSTRAINT `qc_inspections_production_order_id_foreign` FOREIGN KEY (`production_order_id`) REFERENCES `production_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `qc_inspections`
--

LOCK TABLES `qc_inspections` WRITE;
/*!40000 ALTER TABLE `qc_inspections` DISABLE KEYS */;
/*!40000 ALTER TABLE `qc_inspections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `raw_materials`
--

DROP TABLE IF EXISTS `raw_materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `raw_materials` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `inventory_item_id` bigint unsigned NOT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `raw_materials_inventory_item_id_unique` (`inventory_item_id`),
  CONSTRAINT `raw_materials_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `raw_materials`
--

LOCK TABLES `raw_materials` WRITE;
/*!40000 ALTER TABLE `raw_materials` DISABLE KEYS */;
INSERT INTO `raw_materials` VALUES (2,3,'active','2026-03-17 00:27:12','2026-03-17 00:27:12'),(3,4,'active','2026-03-17 00:27:49','2026-03-17 00:27:49'),(4,5,'active','2026-03-17 00:27:55','2026-03-17 00:27:55');
/*!40000 ALTER TABLE `raw_materials` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `role_id` bigint unsigned NOT NULL,
  `permission_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `role_permissions_role_id_permission_id_unique` (`role_id`,`permission_id`),
  KEY `role_permissions_permission_id_foreign` (`permission_id`),
  CONSTRAINT `role_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `role_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=97 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
INSERT INTO `role_permissions` VALUES (1,1,19,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(2,1,33,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(3,1,14,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(4,1,26,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(5,1,10,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(6,1,6,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(7,1,18,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(8,1,22,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(9,1,35,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(10,1,30,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(11,1,2,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(12,1,16,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(13,1,28,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(14,1,12,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(15,1,8,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(16,1,24,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(17,1,37,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(18,1,32,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(19,1,4,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(20,1,15,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(21,1,27,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(22,1,11,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(23,1,7,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(24,1,23,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(25,1,36,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(26,1,31,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(27,1,3,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(28,1,20,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(29,1,13,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(30,1,25,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(31,1,9,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(32,1,5,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(33,1,17,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(34,1,21,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(35,1,34,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(36,1,29,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(37,1,1,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(38,2,19,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(39,2,33,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(40,2,14,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(41,2,26,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(42,2,10,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(43,2,6,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(44,2,18,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(45,2,22,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(46,2,2,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(47,2,28,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(48,2,12,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(49,2,8,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(50,2,15,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(51,2,27,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(52,2,11,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(53,2,7,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(54,2,23,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(55,2,3,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(56,2,20,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(57,2,13,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(58,2,25,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(59,2,9,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(60,2,5,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(61,2,17,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(62,2,21,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(63,2,29,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(64,2,1,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(65,3,19,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(66,3,14,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(67,3,26,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(68,3,6,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(69,3,18,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(70,3,15,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(71,3,27,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(72,3,7,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(73,3,13,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(74,3,25,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(75,3,9,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(76,3,5,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(77,3,17,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(78,3,21,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(79,3,1,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(80,4,19,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(81,4,13,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(82,4,5,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(83,4,17,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(84,4,21,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(85,5,18,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(86,5,17,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(87,7,17,'2026-03-12 14:16:32','2026-03-12 14:16:32'),(88,7,13,'2026-03-12 14:16:32','2026-03-12 14:16:32'),(89,7,38,'2026-03-12 15:06:18','2026-03-12 15:06:18'),(90,7,39,'2026-03-12 15:06:18','2026-03-12 15:06:18'),(91,7,40,'2026-03-12 15:06:18','2026-03-12 15:06:18'),(92,7,41,'2026-03-12 15:06:18','2026-03-12 15:06:18'),(93,7,42,'2026-03-12 15:06:18','2026-03-12 15:06:18'),(94,7,43,'2026-03-12 15:06:18','2026-03-12 15:06:18'),(95,7,44,'2026-03-12 15:06:18','2026-03-12 15:06:18'),(96,7,45,'2026-03-12 15:06:18','2026-03-12 15:06:18');
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_name_unique` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'Super Admin','Full system access with all permissions',1,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(2,'HR Manager','Human Resources management with full HR access',1,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(3,'HR Officer','Human Resources officer with limited HR access',1,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(4,'Department Head','Department head with access to department-specific functions',1,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(5,'Employee','Regular employee with basic access',1,'2026-02-22 23:20:34','2026-02-22 23:20:34'),(6,'outlet_user','Outlet sales user',1,'2026-03-04 22:50:33','2026-03-04 22:50:33'),(7,'Sales Ref',NULL,1,'2026-03-12 14:16:32','2026-03-12 14:16:32');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `routes`
--

DROP TABLE IF EXISTS `routes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `routes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `origin` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `destination` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `distance_km` decimal(8,2) NOT NULL,
  `estimated_duration_hours` decimal(4,2) NOT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `route_type` enum('local','inter_city','highway') COLLATE utf8mb4_unicode_ci NOT NULL,
  `toll_charges` decimal(10,2) NOT NULL DEFAULT '0.00',
  `fuel_estimate_liters` decimal(8,2) NOT NULL DEFAULT '0.00',
  `description` text COLLATE utf8mb4_unicode_ci,
  `waypoints` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `routes`
--

LOCK TABLES `routes` WRITE;
/*!40000 ALTER TABLE `routes` DISABLE KEYS */;
INSERT INTO `routes` VALUES (1,'Colombo City Route','Colombo Central Warehouse','Colombo City Center',15.50,1.50,'active','local',150.00,12.50,'Main route for Colombo city deliveries','[\"Colombo Fort\", \"Pettah\", \"Slave Island\"]','2026-02-23 14:34:43','2026-02-23 14:34:43'),(2,'Colombo-Kandy Highway','Colombo Distribution Center','Kandy Warehouse',115.00,3.50,'active','highway',850.00,45.00,'Major highway route connecting Colombo to Kandy','[\"Kadawatha\", \"Gampaha\", \"Veyangoda\", \"Katugastota\"]','2026-02-23 14:34:43','2026-02-23 14:34:43'),(3,'Galle Coastal Route','Colombo Port','Galle Harbor',125.00,4.00,'active','inter_city',320.00,38.50,'Coastal route for southern deliveries','[\"Panadura\", \"Kalutara\", \"Beruwala\", \"Bentota\", \"Hikkaduwa\"]','2026-02-23 14:34:43','2026-02-23 14:34:43'),(4,'Jaffna Northern Route','Colombo Main Depot','Jaffna Distribution Center',395.00,8.50,'active','highway',1250.00,95.00,'Long distance route to northern region','[\"Kurunegala\", \"Anuradhapura\", \"Vavuniya\", \"Kilinochchi\"]','2026-02-23 14:34:43','2026-02-23 14:34:43'),(5,'Matara Southern Route','Colombo South Depot','Matara Warehouse',165.00,5.00,'active','inter_city',450.00,52.00,'Southern route for regional distribution','[\"Moratuwa\", \"Panadura\", \"Kalutara\", \"Galle\", \"Weligama\"]','2026-02-23 14:34:43','2026-02-23 14:34:43'),(6,'Colombo Jafna Route','Colombo','Colombo',89.00,5.00,'active','local',5000.00,45.00,NULL,NULL,'2026-02-23 14:41:27','2026-02-23 14:41:27'),(7,'Colombo City Route','Colombo Central Warehouse','Colombo City Center',15.50,1.50,'active','local',150.00,12.50,'Main route for Colombo city deliveries',NULL,'2026-02-23 14:43:40','2026-02-23 14:43:40'),(8,'Colombo-Kandy Highway','Colombo Distribution Center','Kandy Warehouse',115.00,3.50,'active','highway',850.00,45.00,'Major highway route connecting Colombo to Kandy','[\"Kadawatha\", \"Gampaha\"]','2026-02-23 14:43:40','2026-02-23 14:43:40'),(9,'Galle Coastal Route','Colombo Port','Galle Harbor',125.00,4.00,'active','inter_city',320.00,38.50,'Coastal route for southern deliveries',NULL,'2026-02-23 14:43:40','2026-02-23 14:43:40'),(10,'Jaffna Northern Route','Colombo Main Depot','Jaffna Distribution Center',395.00,8.50,'active','highway',1250.00,95.00,'Long distance route to northern region','[\"Kurunegala\", \"Anuradhapura\"]','2026-02-23 14:43:40','2026-02-23 14:43:40'),(11,'Matara Southern Route','Colombo South Depot','Matara Warehouse',165.00,5.00,'active','inter_city',450.00,52.00,'Southern route for regional distribution',NULL,'2026-02-23 14:43:40','2026-02-23 14:43:40');
/*!40000 ALTER TABLE `routes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_activity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
INSERT INTO `sessions` VALUES ('aPgGusSJ69cXcSriWmmPZHfxBMCeEs4uZupaWJhR',NULL,'127.0.0.1','','YTozOntzOjY6Il90b2tlbiI7czo0MDoia09VdE1pZDA1eGs0S2lrR0NxRlJFd0NMTlNyU21oajlLZEVDQm84UyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6MjE6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMCI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==',1772608419),('MqHC4KrDFmadVX0osK6znUfFhi1d8FJdlqK3rWEA',NULL,'127.0.0.1','','YTozOntzOjY6Il90b2tlbiI7czo0MDoiQVUxQW91TFk0ZnFFZzIxUXJyQk04amVReWU5T0FVaVFKbXRIUGJ1MSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6MjE6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMCI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==',1772608430),('U7dgaMcSFej4GYavFsiabqS3GmTMBMhf4SQsvPwh',NULL,'127.0.0.1','','YTozOntzOjY6Il90b2tlbiI7czo0MDoiY0wwYmR5RmlndXA5RUlMOUpnU1c1d1AxWU1pdllFbHpXVEc4RDFaViI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6MjE6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMCI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==',1772608405),('Yw2TEc6y67UlufYHbDTLb2gN35Xaa217fq3ejLA3',NULL,'127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.2200','YTozOntzOjY6Il90b2tlbiI7czo0MDoibHNrQU1kcWdldERPVElvbTlFYVBWbDBNV2hqV0gzdlRiMjkxaUlTaSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6MjE6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMCI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==',1772608396);
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stock_transfers`
--

DROP TABLE IF EXISTS `stock_transfers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_transfers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `transfer_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inventory_item_id` bigint unsigned NOT NULL,
  `outlet_id` bigint unsigned NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `transferred_by` bigint unsigned DEFAULT NULL,
  `transferred_at` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `stock_transfers_inventory_item_id_foreign` (`inventory_item_id`),
  KEY `stock_transfers_outlet_id_foreign` (`outlet_id`),
  KEY `stock_transfers_transferred_by_foreign` (`transferred_by`),
  KEY `stock_transfers_transfer_reference_index` (`transfer_reference`),
  CONSTRAINT `stock_transfers_inventory_item_id_foreign` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_transfers_outlet_id_foreign` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `stock_transfers_transferred_by_foreign` FOREIGN KEY (`transferred_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stock_transfers`
--

LOCK TABLES `stock_transfers` WRITE;
/*!40000 ALTER TABLE `stock_transfers` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_transfers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suppliers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `company` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `outstanding_balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` VALUES (1,'Akalanka Imesh','0714545223','akale@gmail.com','0714554885','Thalawitiya,Parakaduwa','Arimac','active',56000.00,'2026-02-23 13:03:46','2026-02-23 13:03:46'),(2,'Ebilipitiya Kumara','kumara','kumara@gmail.com','0712323221','Ebilipitiya','Kumara','active',0.00,'2026-03-17 14:31:20','2026-03-17 14:31:20');
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_settings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `system_settings_key_unique` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_settings`
--

LOCK TABLES `system_settings` WRITE;
/*!40000 ALTER TABLE `system_settings` DISABLE KEYS */;
INSERT INTO `system_settings` VALUES (1,'system_enabled','1','2026-03-15 22:07:41','2026-03-15 22:07:41'),(2,'security_enforce_strong_passwords','1','2026-03-15 22:15:37','2026-03-15 22:15:37'),(3,'security_require_two_factor','0','2026-03-15 22:15:37','2026-03-15 22:15:37'),(4,'security_lockout_enabled','1','2026-03-15 22:15:37','2026-03-15 22:15:37'),(5,'security_max_failed_attempts','5','2026-03-15 22:15:37','2026-03-15 22:15:37'),(6,'security_session_timeout_minutes','120','2026-03-15 22:15:37','2026-03-15 22:15:37'),(7,'security_password_expiry_days','90','2026-03-15 22:15:37','2026-03-15 22:15:37'),(8,'backup_auto_enabled','1','2026-03-15 22:23:17','2026-03-15 22:23:17'),(9,'backup_frequency','daily','2026-03-15 22:23:17','2026-03-15 22:23:17'),(10,'backup_retention_days','30','2026-03-15 22:23:17','2026-03-15 22:23:17'),(11,'backup_include_uploaded_files','1','2026-03-15 22:23:17','2026-03-15 22:23:17'),(12,'backup_encryption_enabled','1','2026-03-15 22:23:17','2026-03-15 22:23:17'),(13,'backup_cloud_sync_enabled','0','2026-03-15 22:23:17','2026-03-15 22:23:17');
/*!40000 ALTER TABLE `system_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `test`
--

DROP TABLE IF EXISTS `test`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `test` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `test`
--

LOCK TABLES `test` WRITE;
/*!40000 ALTER TABLE `test` DISABLE KEYS */;
/*!40000 ALTER TABLE `test` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `assigned_at` timestamp NOT NULL,
  `assigned_by` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_roles_user_id_role_id_unique` (`user_id`,`role_id`),
  KEY `user_roles_role_id_foreign` (`role_id`),
  KEY `user_roles_assigned_by_foreign` (`assigned_by`),
  CONSTRAINT `user_roles_assigned_by_foreign` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_roles_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_roles_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_roles`
--

LOCK TABLES `user_roles` WRITE;
/*!40000 ALTER TABLE `user_roles` DISABLE KEYS */;
INSERT INTO `user_roles` VALUES (1,3,6,'2026-03-04 22:50:33',2,'2026-03-04 22:50:33','2026-03-04 22:50:33'),(2,5,6,'2026-03-04 23:56:13',2,'2026-03-04 23:56:13','2026-03-04 23:56:13'),(4,7,7,'2026-03-12 15:17:01',2,NULL,NULL);
/*!40000 ALTER TABLE `user_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'employee',
  `employee_id` bigint unsigned DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  KEY `users_employee_id_foreign` (`employee_id`),
  KEY `users_branch_id_foreign` (`branch_id`),
  CONSTRAINT `users_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `users_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Test User','test@example.com','2026-02-22 23:20:32','$2y$12$LnQrMgxob1mwfwwXYsD5tuWggaUq8udSzRK.JxbIti0pj/s44rrhG','employee',NULL,NULL,'dMuRhSh85l','2026-02-22 23:20:33','2026-02-22 23:20:33'),(2,'Super Admin','admin@gmail.com',NULL,'$2y$12$/u17w98UF//sZSUNA4KnAOpGCcCfD9lgC3eKl57Ab02DpTCbGUrMS','admin',NULL,NULL,NULL,'2026-02-22 23:20:33','2026-02-22 23:20:33'),(3,'factoryoutlet','factory@gmail.com',NULL,'$2y$12$am4sHt3SdRiP0kp1pIskiOKJAfaZDQ/KOi7DHR9OWdRBSpWrnXpUy','employee',NULL,NULL,NULL,'2026-03-04 22:50:33','2026-03-04 22:50:33'),(4,'Jagath Siriwardhana','jagath@gmail.com',NULL,'$2y$12$McyTehqPLf.Hgodk4QCWDuX/MLC0fAwvyN0d.Q827luI6M5t1HFNu','manager',6,1,NULL,'2026-03-04 23:16:42','2026-03-04 23:16:42'),(5,'Factory_One','factoryone@gmail.com',NULL,'$2y$12$OcrQyCTnnHlppL4dbH4/GO4xrpEMLbTMGYSlnOPeUm0n7hIrdM68i','employee',NULL,NULL,NULL,'2026-03-04 23:56:13','2026-03-04 23:56:13'),(6,'Amila Sandaruwan','amilaasndaruwan@gmail.com',NULL,'$2y$12$IoTgrkUD5n.s6/qSPjbrD.fVvy/LjCs8Im8LCJxX0jGc6.UAnFZtu','Sales Ref',7,1,NULL,'2026-03-05 21:29:34','2026-03-05 21:29:34'),(7,'Samiru Dilshan','samiru@gmail.com',NULL,'$2y$12$2MYaSTzCrLfyIA/feKBWvuSkcmUIDkBVpX2JipGfqFF/LGzUx6te.','Sales Ref',8,1,NULL,'2026-03-09 12:39:48','2026-03-09 12:39:48');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicles`
--

DROP TABLE IF EXISTS `vehicles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `registration_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('truck','van','pickup','lorry') COLLATE utf8mb4_unicode_ci NOT NULL,
  `capacity_kg` decimal(10,2) NOT NULL,
  `status` enum('active','maintenance','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `fuel_type` enum('diesel','petrol','electric') COLLATE utf8mb4_unicode_ci NOT NULL,
  `model` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `year` year NOT NULL,
  `insurance_expiry` date NOT NULL,
  `license_expiry` date NOT NULL,
  `current_location` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `vehicles_registration_number_unique` (`registration_number`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicles`
--

LOCK TABLES `vehicles` WRITE;
/*!40000 ALTER TABLE `vehicles` DISABLE KEYS */;
INSERT INTO `vehicles` VALUES (6,'PB8899','lorry',5000.00,'active','diesel','Mazda',2015,'2026-04-24','2026-04-24','Factory',NULL,'2026-02-23 14:10:16','2026-02-23 14:10:16');
/*!40000 ALTER TABLE `vehicles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'pabasaraDB'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-23  6:56:47
