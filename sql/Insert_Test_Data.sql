-- ======================================================================
-- SCRIPT KHỞI TẠO DATABASE VÀ CHÈN DỮ LIỆU GIẢ LẬP (MOCK DATA) ĐỂ TEST HMI
-- Tên Database: BatchDB
-- Tên Bảng: BatchHistory
-- ======================================================================

-- 1. Đảm bảo Database BatchDB đã tồn tại
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'BatchDB')
BEGIN
    CREATE DATABASE BatchDB;
END
GO

USE BatchDB;
GO

-- 2. Đảm bảo Bảng BatchHistory đã tồn tại
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BatchHistory]') AND type in (N'U'))
BEGIN
    CREATE TABLE BatchHistory (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        BatchID NVARCHAR(50),
        BatchNumber INT,
        Target_Weight REAL,
        Actual_Weight REAL,
        Deviation_Pct REAL,
        Status INT, -- 1=Đạt (OK), 2=Dừng (Abort), 3=Lỗi (Error)
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

    -- Tạo index tìm kiếm nhanh
    CREATE INDEX idx_timestamp ON BatchHistory(Timestamp_DTL);
    CREATE INDEX idx_batchid ON BatchHistory(BatchID);
END
GO

-- 3. XÓA SẠCH DỮ LIỆU CŨ TRƯỚC KHI CHÈN (Để test sạch sẽ từ đầu)
TRUNCATE TABLE BatchHistory;
GO

-- 4. CHÈN 5 BẢN GHI GIẢ LẬP TRỰC QUAN
-- Bản ghi 1: Mẻ cân hoàn hảo, thành công (Status = 1, Error = 0) vào Tháng 5/2026
INSERT INTO BatchHistory (
    BatchID, BatchNumber, Target_Weight, Actual_Weight, Deviation_Pct, Status, Error_Count, Duration_sec, Timestamp_DTL,
    F1_Target, F1_Actual, F2_Target, F2_Actual, F3_Target, F3_Actual, F4_Target, F4_Actual, F5_Target, F5_Actual, F6_Target, F6_Actual, F7_Target, F7_Actual
) VALUES (
    N'BATCH-MA501', 1, 1000.0, 1002.5, 0.25, 1, 0, 120.5, '2026-05-22 10:15:30',
    150.0, 150.2,  200.0, 201.1,  100.0, 99.8,   50.0, 50.1,   300.0, 301.5,  120.0, 119.5,  80.0, 80.3
);

-- Bản ghi 2: Mẻ cân thành công nhưng có cảnh báo lỗi nhỏ (Status = 1, Error = 2) vào Tháng 5/2026
INSERT INTO BatchHistory (
    BatchID, BatchNumber, Target_Weight, Actual_Weight, Deviation_Pct, Status, Error_Count, Duration_sec, Timestamp_DTL,
    F1_Target, F1_Actual, F2_Target, F2_Actual, F3_Target, F3_Actual, F4_Target, F4_Actual, F5_Target, F5_Actual, F6_Target, F6_Actual, F7_Target, F7_Actual
) VALUES (
    N'BATCH-MA502', 2, 1200.0, 1205.8, 0.48, 1, 2, 145.2, '2026-05-22 11:30:15',
    180.0, 181.5,  220.0, 222.0,  120.0, 119.0,  60.0, 60.5,   350.0, 351.8,  150.0, 149.2,  120.0, 121.8
);

-- Bản ghi 3: Mẻ cân bị dừng đột ngột bởi người vận hành (Status = 2, Error = 0) vào Tháng 5/2026
INSERT INTO BatchHistory (
    BatchID, BatchNumber, Target_Weight, Actual_Weight, Deviation_Pct, Status, Error_Count, Duration_sec, Timestamp_DTL,
    F1_Target, F1_Actual, F2_Target, F2_Actual, F3_Target, F3_Actual, F4_Target, F4_Actual, F5_Target, F5_Actual, F6_Target, F6_Actual, F7_Target, F7_Actual
) VALUES (
    N'BATCH-MA503', 3, 1000.0, 450.2, -54.98, 2, 0, 45.0, '2026-05-22 13:05:00',
    150.0, 150.1,  200.0, 200.5,  100.0, 99.6,   50.0, 0.0,    300.0, 0.0,    120.0, 0.0,    80.0, 0.0
);

-- Bản ghi 4: Mẻ cân bị lỗi nghiêm trọng hệ thống (Status = 3, Error = 7) vào Tháng 5/2026
INSERT INTO BatchHistory (
    BatchID, BatchNumber, Target_Weight, Actual_Weight, Deviation_Pct, Status, Error_Count, Duration_sec, Timestamp_DTL,
    F1_Target, F1_Actual, F2_Target, F2_Actual, F3_Target, F3_Actual, F4_Target, F4_Actual, F5_Target, F5_Actual, F6_Target, F6_Actual, F7_Target, F7_Actual
) VALUES (
    N'BATCH-MA504', 4, 1500.0, 1535.4, 2.36, 3, 7, 210.8, '2026-05-22 13:45:22',
    200.0, 210.5,  300.0, 312.4,  150.0, 151.2,  100.0, 105.8,  400.0, 395.0,  200.0, 205.5,  150.0, 155.0
);

-- Bản ghi 5: Mẻ cân ở THÁNG TRƯỚC (Tháng 4/2026) để kiểm tra tính năng Lọc Theo Tháng/Năm
INSERT INTO BatchHistory (
    BatchID, BatchNumber, Target_Weight, Actual_Weight, Deviation_Pct, Status, Error_Count, Duration_sec, Timestamp_DTL,
    F1_Target, F1_Actual, F2_Target, F2_Actual, F3_Target, F3_Actual, F4_Target, F4_Actual, F5_Target, F5_Actual, F6_Target, F6_Actual, F7_Target, F7_Actual
) VALUES (
    N'BATCH-AP499', 99, 1000.0, 999.2, -0.08, 1, 0, 115.0, '2026-04-15 08:20:10',
    150.0, 149.8,  200.0, 199.9,  100.0, 100.1,  50.0, 49.9,   300.0, 300.2,  120.0, 119.8,  80.0, 79.5
);
GO

-- 5. Cấp quyền cho user hệ thống (WinCC Unified Runtime)
USE BatchDB;
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'NT AUTHORITY\SYSTEM')
BEGIN
    CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM];
END
ALTER ROLE db_owner ADD MEMBER [NT AUTHORITY\SYSTEM];
GO

-- 6. Hiển thị lại toàn bộ dữ liệu vừa tạo để kiểm tra trên SSMS
SELECT * FROM BatchHistory ORDER BY Timestamp_DTL DESC;
GO
