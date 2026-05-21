-- 1. Tạo Database
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'BatchDB')
BEGIN
    CREATE DATABASE BatchDB;
END
GO

USE BatchDB;
GO

-- 2. Tạo bảng lưu trữ lịch sử cân
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BatchHistory]') AND type in (N'U'))
BEGIN
    CREATE TABLE BatchHistory (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        BatchID NVARCHAR(50),
        BatchNumber INT,
        Target_Weight REAL,
        Actual_Weight REAL,
        Deviation_Pct REAL,
        Status INT, -- 1=OK, 2=Abort, 3=Error
        Error_Count INT,
        Duration_sec REAL,
        Timestamp_DTL DATETIME,
        
        -- Dữ liệu 7 Feeder
        F1_Target REAL, F1_Actual REAL,
        F2_Target REAL, F2_Actual REAL,
        F3_Target REAL, F3_Actual REAL,
        F4_Target REAL, F4_Actual REAL,
        F5_Target REAL, F5_Actual REAL,
        F6_Target REAL, F6_Actual REAL,
        F7_Target REAL, F7_Actual REAL
    );

    -- Index để tìm kiếm nhanh
    CREATE INDEX idx_timestamp ON BatchHistory(Timestamp_DTL);
    CREATE INDEX idx_batchid ON BatchHistory(BatchID);
END
GO



USE BatchDB;
-- Cấp quyền cho user hệ thống (thường là NT AUTHORITY\SYSTEM)
CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM];
ALTER ROLE db_owner ADD MEMBER [NT AUTHORITY\SYSTEM];
GO

        
---------- LỆNH HỆ THỐNG QUẢN LÝ DỮ LIỆU ----------
-- Xóa tất cả dữ liệu trong bảng:
DELETE FROM [BatchDB].[dbo].[BatchHistory]


---
TRUNCATE TABLE [BatchDB].[dbo].[BatchHistory]

-- Xóa theo BatchID
DELETE FROM [BatchDB].[dbo].[BatchHistory]
WHERE [BatchID] = 'value_here'

-- Xóa theo ngày
DELETE FROM [BatchDB].[dbo].[BatchHistory]
WHERE [Timestamp_DTL] < '2026-01-01'

-- Xóa theo Status
DELETE FROM [BatchDB].[dbo].[BatchHistory]
WHERE [Status] = 'Failed'

-- 3. LỆNH MIGRATION ĐỂ CẬP NHẬT TIẾNG VIỆT (Nếu bảng đã tồn tại)
-- Run this in SSMS:
-- USE BatchDB;
-- ALTER TABLE BatchHistory ALTER COLUMN BatchID NVARCHAR(50);
-- GO

-- USE BatchDB;
-- GO

-- 1. Drop the existing index
-- DROP INDEX idx_batchid ON BatchHistory;
-- GO

-- -- 2. Alter the column to NVARCHAR
-- ALTER TABLE BatchHistory ALTER COLUMN BatchID NVARCHAR(50);
-- GO

-- -- 3. Re-create the index
-- CREATE INDEX idx_batchid ON BatchHistory(BatchID);
-- GO
