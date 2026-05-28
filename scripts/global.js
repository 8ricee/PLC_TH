// ======================================================================
// CẤU HÌNH HỆ THỐNG & TAGS HMI (Dễ dàng thay đổi khi sang máy khác)
// ======================================================================
const DB_CONNECTION_STRING = "Driver={ODBC Driver 17 for SQL Server};Server=.\\WINCC;Database=BatchDB;Trusted_Connection=yes;TrustServerCertificate=yes;";
const EXPORT_FOLDER = "D:/Installer/";
const ROWS_PER_PAGE = 20; // Số dòng hiển thị trên một trang HMI
const TAG_REPORT_URL = "URL"; // Tên Internal Tag HMI liên kết trực tiếp với thuộc tính URL của Web Control

// Tên các Tag kiểm soát quá trình ghi Batch Log tự động
const TAG_BATCHLOG_WRITE_INDEX = "DB_BatchLog_WriteIndex";
const TAG_LAST_PROCESSED_INDEX = "LastProcessedIndex";
const TAG_BATCHLOG_RECORDS_BASE = "DB_BatchLog_Records";

// Tên các Tag lọc dữ liệu trên giao diện HMI
const TAG_FILTER_YEAR = "Filter_Year";
const TAG_FILTER_MONTH = "Filter_Month";

// Tên các Tag lọc tìm kiếm trên giao diện HMI
const TAG_SEARCH_BATCH_ID = "Search_BatchID";
const TAG_SEARCH_DATE_FROM = "Search_DateFrom";
const TAG_SEARCH_DATE_TO = "Search_DateTo";
const TAG_SEARCH_STATUS = "Search_Status";
const TAG_SEARCH_BATCH_NUMBER = "Search_BatchNumber";

// Tên các Tag chứa dữ liệu của mẻ hiện tại (LIVE)
const TAG_LIVE_BATCH_ID = "DB_HMI_Data_Recipe_Current_Recipe.BatchID";
const TAG_LIVE_TARGET_PRODUCTION = "DB_HMI_Data_Recipe_Current_Recipe.Target_Production";
const TAG_LIVE_BATCH_NUMBER = "DB_HMI_Data_Recipe_Current_Recipe.BatchNumber";
const TAG_LIVE_ACTUAL_BATCH_NUM = "DB_HMI_Data_System_Status_Current_Batch";
const TAG_LIVE_ELAPSED_TIME = "DB_HMI_Data_System_Status_Elapsed_Time";
const TAG_LIVE_ACTUAL_TOTAL_WEIGHT = "DB_HMI_Data_System_Status_Actual_Total_Weight";

// Tên mảng dữ liệu công thức và chi tiết từng cân
const TAG_LIVE_MATERIAL_PERCENTS = "DB_HMI_Data_Recipe_Current_Recipe.Material_Percents";
const TAG_LIVE_FEEDERS_DETAIL = "DB_HMI_Data_Feeders_Detail";

// Các tag Array dùng cho faceplate hiển thị lịch sử trên màn hình
const TAG_ARR_ROW_NUMBER = "RowNumber";
const TAG_ARR_BATCH_ID = "BatchID";
const TAG_ARR_BATCH_NUMBER = "BatchNumber";
const TAG_ARR_TARGET = "Target";
const TAG_ARR_ACTUAL = "Actual";
const TAG_ARR_DEV = "Dev";
const TAG_ARR_STATUS = "Status";
const TAG_ARR_DURATION = "Duration";
const TAG_ARR_TIME = "Time";
const TAG_ARR_VISIBLE = "Visible";

// Các tag mới thêm cho giao diện chi tiết (Master-Detail)
const TAG_ARR_ERROR_COUNT = "ErrorCount"; // Mảng Array[0..19] để hiển thị số lượng lỗi của 20 dòng trên bảng chính

// Các tag đơn/mảng nhỏ đại diện cho mẻ cân được Click chọn để hiển thị chi tiết ở nửa dưới màn hình
const TAG_SEL_BATCH_ID = "Selected_BatchID";
const TAG_SEL_BATCH_NUMBER = "Selected_BatchNumber";
const TAG_SEL_ERROR_COUNT = "Selected_ErrorCount";
const TAG_SEL_FEEDER_TARGET = "Selected_Feeder_Target"; // Mảng Array[1..7] of Real của mẻ đang chọn
const TAG_SEL_FEEDER_ACTUAL = "Selected_Feeder_Actual"; // Mảng Array[1..7] of Real của mẻ đang chọn
const TAG_SEL_FEEDER_DEV = "Selected_Feeder_Dev"; // Mảng Array[1..7] of Real sai lệch từng cân của mẻ đang chọn


export async function LogBatchToSQL() {
    try {
        // 0. Báo hiệu script đã được gọi
        HMIRuntime.Trace("--- Script LogBatchToSQL Triggered ---");

        // 1. Đọc các chỉ số (Index) để kiểm tra mẻ mới
        let writeIndexTag = Tags(TAG_BATCHLOG_WRITE_INDEX);
        let lastProcessedIndexTag = Tags(TAG_LAST_PROCESSED_INDEX);

        if (!writeIndexTag || !lastProcessedIndexTag) {
            HMIRuntime.Trace("Error: Tags could not be found in HMI Tag Table");
            return;
        }

        let writeIndex = writeIndexTag.Read();
        let lastProcessedIndex = lastProcessedIndexTag.Read();

        // [FIX LỖI GHI DÒNG RỖNG KHI RESTART RUNTIME]
        // Nếu lastProcessedIndex = 0, HMI vừa mới khởi động lại và Tag nội bộ chưa đồng bộ với PLC.
        // Ta đồng bộ LastProcessedIndex bằng WriteIndex thực tế và thoát, tránh ghi dữ liệu rỗng vào SQL Server.
        if (lastProcessedIndex === 0) {
            HMIRuntime.Trace("LogBatchToSQL: HMI Startup detected. Synchronizing Index to " + writeIndex + " without inserting empty data.");
            lastProcessedIndexTag.Write(writeIndex);
            return;
        }

        // Kiểm tra nếu có mẻ thực sự mới (PLC dùng 1-100)
        if (writeIndex !== lastProcessedIndex) {
            HMIRuntime.Trace(`New batch detected: WriteIndex=${writeIndex}, LastProcessed=${lastProcessedIndex}`);

            // Xác định bản ghi vừa mới ghi xong (PLC 1..100)
            let recordIndex_PLC = (writeIndex === 1) ? 20 : (writeIndex - 1);
            let recordIndex_HMI = recordIndex_PLC - 1;

            // 2. TRUY CẬP PHẦN TỬ
            let tagBase = TAG_BATCHLOG_RECORDS_BASE + "[" + recordIndex_HMI + "]";
            function readTag(subPath) {
                let t = Tags(tagBase + "." + subPath);
                return t ? t.Read() : null;
            }

            let record = {
                BatchID: readTag("BatchID") || "N/A",
                BatchNumber: readTag("BatchNumber") || 0,
                Target_Weight: readTag("Target_Weight") || 0,
                Actual_Weight: readTag("Actual_Weight") || 0,
                Deviation_Pct: readTag("Deviation_Pct") || 0,
                Status: readTag("Status") || 0,
                Error_Count: readTag("Error_Count") || 0,
                Duration_sec: readTag("Duration_sec") || 0,
                Feeder_Target: [],
                Feeder_Actual: []
            };

            for (let i = 0; i < 7; i++) {
                record.Feeder_Target[i] = readTag(`Feeder_Target[${i}]`) || 0;
                record.Feeder_Actual[i] = readTag(`Feeder_Actual[${i}]`) || 0;
            }

            // Áp dụng Dynamic Auto-Scaling cho Tổng mục tiêu và Tổng thực tế mẻ lịch sử (Tấn sang Kg)
            let sumFeederActuals = 0;
            for (let i = 0; i < 7; i++) {
                sumFeederActuals += record.Feeder_Actual[i];
            }

            let logScaleFactor = 1.0;
            if (sumFeederActuals > 0 && record.Actual_Weight > 0 && record.Actual_Weight < (sumFeederActuals / 100.0)) {
                logScaleFactor = 1000.0;
            } else if (sumFeederActuals === 0) {
                if (record.Target_Weight > 0 && record.Target_Weight < 50) {
                    logScaleFactor = 1000.0;
                }
            }

            if (logScaleFactor !== 1.0) {
                record.Target_Weight = record.Target_Weight * logScaleFactor;
                record.Actual_Weight = record.Actual_Weight * logScaleFactor;
                HMIRuntime.Trace("LogBatchToSQL scaling applied: x" + logScaleFactor + ". New Target=" + record.Target_Weight + ", Actual=" + record.Actual_Weight);
            }

            // Timestamp Fallback
            let year, month, day, hour, minute, second;
            let d = readTag("Timestamp_DTL");
            if (d && typeof d === 'object' && Object.prototype.toString.call(d) === '[object Date]') {
                year = d.getFullYear(); month = d.getMonth() + 1; day = d.getDate();
                hour = d.getHours(); minute = d.getMinutes(); second = d.getSeconds();
            } else {
                let now = new Date();
                year = now.getFullYear(); month = now.getMonth() + 1; day = now.getDate();
                hour = now.getHours(); minute = now.getMinutes(); second = now.getSeconds();
            }
            let ts = `${year}-${month}-${day} ${hour}:${minute}:${second}`;

            // 3. Thực thi SQL (Chuẩn WinCC Unified V19 - Theo Siemens ID 109806573)
            // [ANTI-DUPLICATE] Dùng IF NOT EXISTS để chống ghi trùng khi nhiều tab HMI cùng mở
            let sql = `
                IF NOT EXISTS (
                    SELECT 1 FROM [BatchDB].[dbo].[BatchHistory] WHERE Timestamp_DTL = '${ts}'
                )
                BEGIN
                    INSERT INTO BatchHistory (
                        BatchID, BatchNumber, Target_Weight, Actual_Weight, Deviation_Pct, Status, Error_Count, Duration_sec, Timestamp_DTL,
                        F1_Target, F1_Actual, F2_Target, F2_Actual, F3_Target, F3_Actual,
                        F4_Target, F4_Actual, F5_Target, F5_Actual, F6_Target, F6_Actual, F7_Target, F7_Actual
                    ) VALUES (
                        N'${record.BatchID}', ${record.BatchNumber}, ${record.Target_Weight}, ${record.Actual_Weight}, ${record.Deviation_Pct}, 
                        ${record.Status}, ${record.Error_Count}, ${record.Duration_sec}, '${ts}',
                        ${record.Feeder_Target[0]}, ${record.Feeder_Actual[0]}, ${record.Feeder_Target[1]}, ${record.Feeder_Actual[1]},
                        ${record.Feeder_Target[2]}, ${record.Feeder_Actual[2]}, ${record.Feeder_Target[3]}, ${record.Feeder_Actual[3]},
                        ${record.Feeder_Target[4]}, ${record.Feeder_Actual[4]}, ${record.Feeder_Target[5]}, ${record.Feeder_Actual[5]},
                        ${record.Feeder_Target[6]}, ${record.Feeder_Actual[6]}
                    )
                END`;

            try {
                HMIRuntime.Trace("Executing SQL (V19 CreateConnection approach)...");
                // Bước A: Tạo đối tượng kết nối (V19 bắt buộc bước này và phải await)
                let dbConn = await HMIRuntime.Database.CreateConnection(DB_CONNECTION_STRING);

                // Bước B: Thực thi lệnh SQL trên đối tượng kết nối vừa tạo
                await dbConn.Execute(sql);

                HMIRuntime.Trace("SQL INSERT SUCCESS!");
                lastProcessedIndexTag.Write(writeIndex);
                HMIRuntime.Trace("Updated LastProcessedIndex to: " + writeIndex);
            } catch (err) {
                HMIRuntime.Trace("SQL FAILED (V19 API): " + err.message);
                if (err.message.indexOf("ODBC Driver") !== -1) {
                    HMIRuntime.Trace("TIP: Hãy thử đổi Driver sang 'ODBC Driver 18 for SQL Server' trong Connection String.");
                }
            }
        }
    } catch (e) {
        HMIRuntime.Trace("CRITICAL SCRIPT ERROR: " + e.message);
    }
}

// 5. HÀM KÍCH HOẠT TỰ ĐỘNG (Dùng timer trong Runtime context)
// LƯU Ý: Phải được gọi từ sự kiện 'Loaded' của một Màn hình chính (GfxRTS.exe)
let loggingTimer = null;
export function StartLoggingTimer() {
    if (loggingTimer === null) {
        HMIRuntime.Trace("--- Starting Background Logging Timer (V19 GfxRTS) ---");
        loggingTimer = HMIRuntime.Timers.SetInterval(() => {
            LogBatchToSQL().catch(e => {
                HMIRuntime.Trace("Timer task error: " + e.message);
            });
        }, 5000);
    } else {
        HMIRuntime.Trace("Logging timer is already running.");
    }
}

// HELPER: Format timestamp thành chuỗi đọc được
function formatTimestamp(val) {
    try {
        let d;
        if (typeof val === 'number') {
            d = new Date(val);
        } else if (typeof val === 'object' && val instanceof Date) {
            d = val;
        } else if (typeof val === 'string' && val !== '') {
            d = new Date(val);
        } else {
            return '';
        }
        if (isNaN(d.getTime())) return String(val);
        let pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' '
            + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    } catch (e) {
        return String(val || '');
    }
}

// HELPER: Format duration (seconds) to hh:mm:ss
function formatDuration(totalSeconds) {
    let total = Number(totalSeconds) || 0;
    let h = Math.floor(total / 3600);
    total %= 3600;
    let m = Math.floor(total / 60);
    let s = Math.floor(total % 60);
    let pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return pad(h) + ':' + pad(m) + ':' + pad(s);
}

// HELPER: Lấy timestamp đã định dạng cho tên file (ví dụ: 2026-05-21_15-34-21)
function getFormattedTimestamp(includeSeconds) {
    let dt = new Date();
    let pad = n => n < 10 ? '0' + n : '' + n;
    let dateStr = dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
    let timeStr = pad(dt.getHours()) + "-" + pad(dt.getMinutes()) + (includeSeconds ? "-" + pad(dt.getSeconds()) : "");
    return dateStr + "_" + timeStr;
}

// Helper: Chuyển đổi hàng từ Database sang đối tượng hiển thị/xuất Excel chuẩn
function mapBatchHistoryRows(dataRows) {
    let rows = [];
    for (let k in dataRows) {
        let r = dataRows[k];

        // Đọc trường không phân biệt hoa thường
        let targetWt = r.Target_Weight !== undefined ? r.Target_Weight : (r.TARGET_WEIGHT !== undefined ? r.TARGET_WEIGHT : (r.target_weight !== undefined ? r.target_weight : 0));
        let actualWt = r.Actual_Weight !== undefined ? r.Actual_Weight : (r.ACTUAL_WEIGHT !== undefined ? r.ACTUAL_WEIGHT : (r.actual_weight !== undefined ? r.actual_weight : 0));
        let errorCount = r.Error_Count !== undefined ? r.Error_Count : (r.ERROR_COUNT !== undefined ? r.ERROR_COUNT : (r.error_count !== undefined ? r.error_count : 0));
        let durationSec = r.Duration_sec !== undefined ? r.Duration_sec : (r.DURATION_SEC !== undefined ? r.DURATION_SEC : (r.duration_sec !== undefined ? r.duration_sec : 0));
        let timestampVal = r.Timestamp_DTL !== undefined ? r.Timestamp_DTL : (r.TIMESTAMP_DTL !== undefined ? r.TIMESTAMP_DTL : (r.timestamp_dtl !== undefined ? r.timestamp_dtl : null));
        let batchIdVal = r.BatchID !== undefined ? r.BatchID : (r.BATCHID !== undefined ? r.BATCHID : (r.batchid !== undefined ? r.batchid : ""));
        let batchNumVal = r.BatchNumber !== undefined ? r.BatchNumber : (r.BATCHNUMBER !== undefined ? r.BATCHNUMBER : (r.batchnumber !== undefined ? r.batchnumber : 0));

        // Tính toán sai lệch và làm tròn đến 2 chữ số thập phân
        let devVal = Math.round((actualWt - targetWt) * 100) / 100;

        rows.push({
            Id: r.Id !== undefined ? r.Id : (r.ID !== undefined ? r.ID : (r.id !== undefined ? r.id : 0)),
            BatchID: batchIdVal,
            BatchNumber: batchNumVal,
            Target: targetWt,
            Actual: actualWt,
            Dev: devVal, // Sai lệch kg = Thực tế - Đặt (được làm tròn 2 số thập phân)
            Status: r.BatchStatus !== undefined && r.BatchStatus !== null ? Number(r.BatchStatus) : 0,
            ErrorCount: errorCount,
            Duration: formatDuration(durationSec),
            Time: r.TimeStr || formatTimestamp(timestampVal),
            F1_Target: r.F1_Target, F1_Actual: r.F1_Actual,
            F2_Target: r.F2_Target, F2_Actual: r.F2_Actual,
            F3_Target: r.F3_Target, F3_Actual: r.F3_Actual,
            F4_Target: r.F4_Target, F4_Actual: r.F4_Actual,
            F5_Target: r.F5_Target, F5_Actual: r.F5_Actual,
            F6_Target: r.F6_Target, F6_Actual: r.F6_Actual,
            F7_Target: r.F7_Target, F7_Actual: r.F7_Actual
        });
    }
    return rows;
}

// 6. HÀM ĐỌC DỮ LIỆU LỊCH SỬ TỪ SQL
// Cấu trúc V19 đã xác nhận:
//   response.Results[0].Rows[i].ColumnName
//   Truy cập trực tiếp bằng dot notation (ví dụ: row.BatchID)
let isFetching = false;
export async function GetBatchHistoryFromSQL() {
    if (isFetching) {
        HMIRuntime.Trace("Fetch in progress...");
        return [];
    }
    isFetching = true;
    HMIRuntime.Trace("=== Fetching Batch History ===");

    const query = "SELECT *, Status AS BatchStatus, CONVERT(VARCHAR, Timestamp_DTL, 120) AS TimeStr FROM [BatchDB].[dbo].[BatchHistory] ORDER BY Timestamp_DTL DESC";

    try {
        // Bước A: Tạo kết nối (giống LogBatchToSQL)
        let dbConn = await HMIRuntime.Database.CreateConnection(DB_CONNECTION_STRING);

        // Bước B: Execute (giống LogBatchToSQL)
        let response = await dbConn.Execute(query);

        // Bước C: Kiểm tra lỗi
        if (response.GlobalError !== 0) {
            HMIRuntime.Trace("SQL Error, GlobalError=" + response.GlobalError);
            isFetching = false;
            return [];
        }

        // Bước D & E: Ánh xạ dữ liệu bằng helper dùng chung
        let rows = mapBatchHistoryRows(response.Results[0].Rows);


        HMIRuntime.Trace("Fetched " + rows.length + " rows successfully!");
        isFetching = false;
        return rows;
    } catch (err) {
        isFetching = false;
        HMIRuntime.Trace("FETCH FAILED: " + err.message);
        return [];
    }
}

// ======================================================================
// PHẦN HIỂN THỊ - HMI Array Tags + Faceplate Tag Interface
// ======================================================================
// HMI Tags dạng Array [0..9]:
//   RowNumber[i], BatchID[i], BatchNumber[i], Target[i], Actual[i],
//   Dev[i], Status[i], Duration[i], Time[i], Visible[i]
// Script ghi: Tags("BatchID[0]").Write("Silic")
// Faceplate Tag Interface bind vào các tag array này

// 7. BIẾN LƯU TRỮ DỮ LIỆU VÀ PHÂN TRANG
let cachedData = [];      // Toàn bộ kết quả từ SQL (Fallback nếu không dùng DataSet)
let currentPage = 0;      // Trang hiện tại (Fallback nếu không dùng DataSet)
let rowsPerPage = ROWS_PER_PAGE;     // Số faceplate trên màn hình (= kích thước array)

// Helper to get active screen dynamically to bypass ScheduledTasks static compilation check
function getActiveScreen() {
    try {
        if (typeof HMIRuntime !== 'undefined') {
            let ui = HMIRuntime["UI"];
            if (ui) {
                return ui["ActiveScreen"];
            }
        }
    } catch (e) { }
    return null;
}



// Helper để lưu và đọc trạng thái từ screen.DataSet (tránh mất state khi click nút độc lập)
function getScreenState(screen) {
    if (!screen || !screen.DataSet) return null;
    try {
        if (screen.DataSet.Exists("HistoryState")) {
            let jsonStr = screen.DataSet.Item("HistoryState");
            if (jsonStr && typeof jsonStr === "string") {
                return JSON.parse(jsonStr);
            }
        }
    } catch (e) {
        HMIRuntime.Trace("Error getting screen state: " + e.message);
    }
    try {
        let state = {
            currentPage: 0,
            cachedData: []
        };
        if (screen.DataSet.Exists("HistoryState")) {
            screen.DataSet.Remove("HistoryState");
        }
        screen.DataSet.Add("HistoryState", JSON.stringify(state));
        return state;
    } catch (err) {
        HMIRuntime.Trace("Error initializing screen state: " + err.message);
        return null;
    }
}

function setScreenState(screen, state) {
    if (!screen || !screen.DataSet || !state) return;
    try {
        let jsonStr = JSON.stringify(state);
        if (screen.DataSet.Exists("HistoryState")) {
            screen.DataSet.Remove("HistoryState");
        }
        screen.DataSet.Add("HistoryState", jsonStr);
    } catch (e) {
        HMIRuntime.Trace("Error setting screen state: " + e.message);
    }
}

// 8. GÁN DỮ LIỆU QUA HMI ARRAY TAGS
function writeToFaceplate(screen, fpIndex, data) {
    let i = fpIndex;
    try {
        Tags(TAG_ARR_ROW_NUMBER + "[" + i + "]").Write(Number(data.RowNumber || 0));
        Tags(TAG_ARR_BATCH_ID + "[" + i + "]").Write(String(data.BatchID || ""));
        Tags(TAG_ARR_BATCH_NUMBER + "[" + i + "]").Write(Number(data.BatchNumber || 0));
        Tags(TAG_ARR_TARGET + "[" + i + "]").Write(Number(data.Target || 0));
        Tags(TAG_ARR_ACTUAL + "[" + i + "]").Write(Number(data.Actual || 0));
        Tags(TAG_ARR_DEV + "[" + i + "]").Write(Number(data.Dev || 0));
        Tags(TAG_ARR_STATUS + "[" + i + "]").Write(Number(data.Status || 0));
        Tags(TAG_ARR_DURATION + "[" + i + "]").Write(String(data.Duration || "00:00:00"));
        Tags(TAG_ARR_TIME + "[" + i + "]").Write(String(data.Time || ""));
        Tags(TAG_ARR_VISIBLE + "[" + i + "]").Write(true);

        // Ghi dữ liệu chi tiết
        Tags(TAG_ARR_ERROR_COUNT + "[" + i + "]").Write(Number(data.ErrorCount || 0));
    } catch (e) {
        HMIRuntime.Trace("writeRow" + i + ": " + e.message);
    }
}

function clearFaceplate(screen, fpIndex) {
    let i = fpIndex;
    try {
        Tags(TAG_ARR_ROW_NUMBER + "[" + i + "]").Write(0);
        Tags(TAG_ARR_BATCH_ID + "[" + i + "]").Write("");
        Tags(TAG_ARR_BATCH_NUMBER + "[" + i + "]").Write(0);
        Tags(TAG_ARR_TARGET + "[" + i + "]").Write(0.0);
        Tags(TAG_ARR_ACTUAL + "[" + i + "]").Write(0.0);
        Tags(TAG_ARR_DEV + "[" + i + "]").Write(0.0);
        Tags(TAG_ARR_STATUS + "[" + i + "]").Write(0);
        Tags(TAG_ARR_DURATION + "[" + i + "]").Write("00:00:00");
        Tags(TAG_ARR_TIME + "[" + i + "]").Write("");
        Tags(TAG_ARR_VISIBLE + "[" + i + "]").Write(false);

        Tags(TAG_ARR_ERROR_COUNT + "[" + i + "]").Write(0);
    } catch (e) { }
}

// 8.5. CHỌN 1 MÈ CÂN ĐỂ XEM CHI TIẾT (Master-Detail)
// Vận hành viên click chọn dòng nào (0-19) trên bảng thì gọi hàm này để cập nhật 7 cân của mẻ đó
export async function SelectBatchRecord(screen, fpIndex) {
    try {
        let s = screen || _screenRef || getActiveScreen();
        let state = getScreenState(s);
        let curPage = state ? state.currentPage : currentPage;
        let dataList = state ? state.cachedData : cachedData;

        if (!dataList || dataList.length === 0) {
            HMIRuntime.Trace("SelectBatchRecord: Không có dữ liệu trong cache.");
            return;
        }

        let startIdx = curPage * rowsPerPage;
        let dataIdx = startIdx + fpIndex;

        if (dataIdx >= dataList.length) {
            HMIRuntime.Trace("SelectBatchRecord: Vượt quá chỉ số dòng dữ liệu.");
            return;
        }

        let r = dataList[dataIdx];

        // Ghi thông tin cơ bản mẻ đang chọn
        Tags(TAG_SEL_BATCH_ID).Write(String(r.BatchID || ""));
        Tags(TAG_SEL_BATCH_NUMBER).Write(Number(r.BatchNumber || 0));
        Tags(TAG_SEL_ERROR_COUNT).Write(Number(r.ErrorCount || 0));

        // Ghi thông số Target, Actual và Dev của 7 cân vào các mảng Selected_Feeder_Target/Actual/Dev [1..7]
        let f1_T = Number(r.F1_Target || 0.0);
        let f1_A = Number(r.F1_Actual || 0.0);
        Tags(TAG_SEL_FEEDER_TARGET + "[1]").Write(f1_T);
        Tags(TAG_SEL_FEEDER_ACTUAL + "[1]").Write(f1_A);
        Tags(TAG_SEL_FEEDER_DEV + "[1]").Write(f1_A - f1_T);

        let f2_T = Number(r.F2_Target || 0.0);
        let f2_A = Number(r.F2_Actual || 0.0);
        Tags(TAG_SEL_FEEDER_TARGET + "[2]").Write(f2_T);
        Tags(TAG_SEL_FEEDER_ACTUAL + "[2]").Write(f2_A);
        Tags(TAG_SEL_FEEDER_DEV + "[2]").Write(f2_A - f2_T);

        let f3_T = Number(r.F3_Target || 0.0);
        let f3_A = Number(r.F3_Actual || 0.0);
        Tags(TAG_SEL_FEEDER_TARGET + "[3]").Write(f3_T);
        Tags(TAG_SEL_FEEDER_ACTUAL + "[3]").Write(f3_A);
        Tags(TAG_SEL_FEEDER_DEV + "[3]").Write(f3_A - f3_T);

        let f4_T = Number(r.F4_Target || 0.0);
        let f4_A = Number(r.F4_Actual || 0.0);
        Tags(TAG_SEL_FEEDER_TARGET + "[4]").Write(f4_T);
        Tags(TAG_SEL_FEEDER_ACTUAL + "[4]").Write(f4_A);
        Tags(TAG_SEL_FEEDER_DEV + "[4]").Write(f4_A - f4_T);

        let f5_T = Number(r.F5_Target || 0.0);
        let f5_A = Number(r.F5_Actual || 0.0);
        Tags(TAG_SEL_FEEDER_TARGET + "[5]").Write(f5_T);
        Tags(TAG_SEL_FEEDER_ACTUAL + "[5]").Write(f5_A);
        Tags(TAG_SEL_FEEDER_DEV + "[5]").Write(f5_A - f5_T);

        let f6_T = Number(r.F6_Target || 0.0);
        let f6_A = Number(r.F6_Actual || 0.0);
        Tags(TAG_SEL_FEEDER_TARGET + "[6]").Write(f6_T);
        Tags(TAG_SEL_FEEDER_ACTUAL + "[6]").Write(f6_A);
        Tags(TAG_SEL_FEEDER_DEV + "[6]").Write(f6_A - f6_T);

        let f7_T = Number(r.F7_Target || 0.0);
        let f7_A = Number(r.F7_Actual || 0.0);
        Tags(TAG_SEL_FEEDER_TARGET + "[7]").Write(f7_T);
        Tags(TAG_SEL_FEEDER_ACTUAL + "[7]").Write(f7_A);
        Tags(TAG_SEL_FEEDER_DEV + "[7]").Write(f7_A - f7_T);

        HMIRuntime.Trace("SelectBatchRecord Success: Mapped details for Batch " + r.BatchID);
    } catch (e) {
        HMIRuntime.Trace("SelectBatchRecord Error: " + e.message);
    }
}


// 9. HIỂN THỊ 1 TRANG DỮ LIỆU (không nhấp nháy)
function displayPage(screen) {
    let s = screen || _screenRef || getActiveScreen();
    if (!s) { HMIRuntime.Trace("displayPage Error: No screen ref"); return; }

    let state = getScreenState(s);
    let curPage = state ? state.currentPage : currentPage;
    let dataList = state ? state.cachedData : cachedData;

    let startIdx = curPage * rowsPerPage;
    let totalPages = Math.max(1, Math.ceil(dataList.length / rowsPerPage));

    // Ghi đè dữ liệu cho trang hiện tại (KHÔNG xóa trước)
    let filledRows = 0;
    for (let i = 0; i < rowsPerPage; i++) {
        let dataIdx = startIdx + i;
        if (dataIdx < dataList.length) {
            let row = dataList[dataIdx];
            // Ưu tiên hiển thị số thứ tự tự tăng từ Database (Id), nếu không có (hoặc bằng 0) thì tự động lấy số thứ tự dòng thực tế (dataIdx + 1)
            row.RowNumber = (row.Id !== undefined && row.Id !== null && row.Id !== 0) ? row.Id : (dataIdx + 1);
            writeToFaceplate(s, i, row);
            filledRows++;
        }
    }

    // Chỉ xóa các hàng THỪA (không có dữ liệu)
    for (let i = filledRows; i < rowsPerPage; i++) {
        clearFaceplate(s, i);
    }

    // Cập nhật thông tin phân trang lên màn hình
    try {
        let pgInfo = s.FindItem("txtPageInfo");
        if (pgInfo) pgInfo.Text = "Trang " + (curPage + 1) + " / " + totalPages;
    } catch (e) { }
    try {
        let totalInfo = s.FindItem("txtTotalRecords");
        if (totalInfo) totalInfo.Text = "Tổng: " + dataList.length + " mẻ";
    } catch (e) { }

    HMIRuntime.Trace("Displaying page " + (curPage + 1) + "/" + totalPages + " (" + dataList.length + " total)");

    // Tự động load chi tiết mẻ đầu tiên (mẻ mới nhất) của trang hiện tại lên giao diện chi tiết
    SelectBatchRecord(s, 0);
}

// 10. CÁC HÀM ĐIỀU KHIỂN - GỌI TỪ HMI
// ** TẤT CẢ hàm đều nhận `screen` từ script trên màn hình **
// Trong screen script, gọi: MyLogs.RefreshHistoryOnScreen(Screen);

// Lưu reference screen để timer dùng
let _screenRef = null;

// Làm mới dữ liệu (lấy tất cả)
export async function RefreshHistoryOnScreen(screen) {
    if (screen) _screenRef = screen;
    let s = screen || _screenRef || getActiveScreen();
    if (!s) { HMIRuntime.Trace("No screen ref"); return; }

    let data = await GetBatchHistoryFromSQL();

    let state = getScreenState(s);
    if (state) {
        state.cachedData = data;
        state.currentPage = 0;
        setScreenState(s, state);
    } else {
        cachedData = data;
        currentPage = 0;
    }

    displayPage(s);
}

// Tìm kiếm theo bộ lọc
export async function SearchAndDisplayOnScreen(screen) {
    HMIRuntime.Trace("--- SearchAndDisplayOnScreen START ---");
    if (screen) _screenRef = screen;
    let s = screen || _screenRef || getActiveScreen();
    if (!s) { HMIRuntime.Trace("Search Error: No screen ref"); return; }

    // Đọc tiêu chí từ I/O Field trên màn hình
    let searchParams = { batchId: "", dateFrom: "", dateTo: "", status: 0, batchNumber: 0 };
    try {
        let f1 = s.FindItem(TAG_SEARCH_BATCH_ID);
        if (f1) { searchParams.batchId = f1.ProcessValue || ""; HMIRuntime.Trace("Search: BatchID=" + searchParams.batchId); }
        else { HMIRuntime.Trace("Search Warning: Search_BatchID not found (" + TAG_SEARCH_BATCH_ID + ")"); }

        let f2 = s.FindItem(TAG_SEARCH_DATE_FROM);
        if (f2) { searchParams.dateFrom = f2.ProcessValue || ""; HMIRuntime.Trace("Search: DateFrom=" + searchParams.dateFrom); }
        else { HMIRuntime.Trace("Search Warning: Search_DateFrom not found (" + TAG_SEARCH_DATE_FROM + ")"); }

        let f3 = s.FindItem(TAG_SEARCH_DATE_TO);
        if (f3) { searchParams.dateTo = f3.ProcessValue || ""; HMIRuntime.Trace("Search: DateTo=" + searchParams.dateTo); }
        else { HMIRuntime.Trace("Search Warning: Search_DateTo not found (" + TAG_SEARCH_DATE_TO + ")"); }

        let f4 = s.FindItem(TAG_SEARCH_STATUS);
        if (f4) { searchParams.status = Number(f4.ProcessValue) || 0; HMIRuntime.Trace("Search: Status=" + searchParams.status); }
        else { HMIRuntime.Trace("Search Warning: Search_Status not found (" + TAG_SEARCH_STATUS + ")"); }

        let f5 = s.FindItem(TAG_SEARCH_BATCH_NUMBER);
        if (f5) { searchParams.batchNumber = Number(f5.ProcessValue) || 0; HMIRuntime.Trace("Search: BatchNumber=" + searchParams.batchNumber); }
        else { HMIRuntime.Trace("Search Warning: Search_BatchNumber not found (" + TAG_SEARCH_BATCH_NUMBER + ")"); }
    } catch (e) {
        HMIRuntime.Trace("Search Exception during FindItem: " + e.message);
    }

    StopHistoryAutoRefresh();
    let data = await SearchBatchHistory(searchParams);

    let state = getScreenState(s);
    if (state) {
        state.cachedData = data;
        state.currentPage = 0;
        setScreenState(s, state);
    } else {
        cachedData = data;
        currentPage = 0;
    }

    displayPage(s);
}

// Trang tiếp theo
export function NextPage(screen) {
    if (screen) _screenRef = screen;
    let s = screen || _screenRef || getActiveScreen();
    if (!s) { HMIRuntime.Trace("NextPage Error: No screen ref"); return; }

    let state = getScreenState(s);
    if (state) {
        let totalPages = Math.max(1, Math.ceil(state.cachedData.length / rowsPerPage));
        if (state.currentPage < totalPages - 1) {
            state.currentPage++;
            setScreenState(s, state);
            displayPage(s);
        }
    } else {
        let totalPages = Math.max(1, Math.ceil(cachedData.length / rowsPerPage));
        if (currentPage < totalPages - 1) {
            currentPage++;
            displayPage(s);
        }
    }
}

// Trang trước
export function PrevPage(screen) {
    if (screen) _screenRef = screen;
    let s = screen || _screenRef || getActiveScreen();
    if (!s) { HMIRuntime.Trace("PrevPage Error: No screen ref"); return; }

    let state = getScreenState(s);
    if (state) {
        if (state.currentPage > 0) {
            state.currentPage--;
            setScreenState(s, state);
            displayPage(s);
        }
    } else {
        if (currentPage > 0) {
            currentPage--;
            displayPage(s);
        }
    }
}

// Nhảy đến trang cụ thể
export function GoToPage(pageNum, screen) {
    if (screen) _screenRef = screen;
    let s = screen || _screenRef || getActiveScreen();
    if (!s) { HMIRuntime.Trace("GoToPage Error: No screen ref"); return; }

    let state = getScreenState(s);
    if (state) {
        let totalPages = Math.max(1, Math.ceil(state.cachedData.length / rowsPerPage));
        state.currentPage = Math.max(0, Math.min(pageNum - 1, totalPages - 1));
        setScreenState(s, state);
        displayPage(s);
    } else {
        let totalPages = Math.max(1, Math.ceil(cachedData.length / rowsPerPage));
        currentPage = Math.max(0, Math.min(pageNum - 1, totalPages - 1));
        displayPage(s);
    }
}

// 10.5 LỌC HIỂN THỊ TRÊN HÀNG BẢNG CHÍNH THEO NĂM/THÁNG (Đọc từ tag Filter_Year và Filter_Month)
// Gắn vào Sự kiện (Events) -> On Click của nút "Lọc" trên HMI
export async function FilterHistoryByYearMonthOnScreen(screen) {
    HMIRuntime.Trace("=== FilterHistoryByYearMonthOnScreen START ===");
    if (screen) _screenRef = screen;
    let s = screen || _screenRef || getActiveScreen();
    if (!s) { HMIRuntime.Trace("Filter Error: No screen ref"); return; }

    let year = 0;
    let month = 0;

    try {
        let yTag = Tags(TAG_FILTER_YEAR);
        if (yTag) year = Number(yTag.Read()) || 0;

        let mTag = Tags(TAG_FILTER_MONTH);
        if (mTag) month = Number(mTag.Read()) || 0;
    } catch (e) {
        HMIRuntime.Trace("Filter Read Tag Error: " + e.message);
    }

    HMIRuntime.Trace("Filtering HMI Grid for Year=" + year + ", Month=" + month);

    if (year === 0 && month === 0) {
        HMIRuntime.Trace("Filter: Không chọn năm/tháng, làm mới hiển thị tất cả.");
        await RefreshHistoryOnScreen(s);
        return;
    }

    StopHistoryAutoRefresh();
    // Tận dụng hàm GetDetailedHistoryByFilter đã có sẵn để lấy dữ liệu từ SQL
    let data = await GetDetailedHistoryByFilter(year, month);

    let state = getScreenState(s);
    if (state) {
        state.cachedData = data;
        state.currentPage = 0;
        setScreenState(s, state);
    } else {
        cachedData = data;
        currentPage = 0;
    }

    displayPage(s);
}

// 11. LOAD DỮ LIỆU KHI MỞ MÀN HÌNH (1 lần, không auto-refresh)
export function LoadHistoryOnOpen(screen) {
    if (screen) _screenRef = screen;
    let s = screen || _screenRef || getActiveScreen();
    HMIRuntime.Trace("--- Loading History Data ---");
    RefreshHistoryOnScreen(s);
}

export function StopHistoryAutoRefresh() {
    // Giữ lại để không bị lỗi nếu script cũ còn gọi
    HMIRuntime.Trace("--- History Cleanup ---");
}

// 12. HÀM TÌM KIẾM MẺ (SQL động)
export async function SearchBatchHistory(searchParams) {
    HMIRuntime.Trace("=== Searching Batch History ===");
    let conditions = [];
    if (searchParams.batchId && searchParams.batchId !== "")
        conditions.push("BatchID LIKE '%" + searchParams.batchId + "%'");
    if (searchParams.dateFrom && searchParams.dateFrom !== "")
        conditions.push("Timestamp_DTL >= '" + searchParams.dateFrom + "'");
    if (searchParams.dateTo && searchParams.dateTo !== "")
        conditions.push("Timestamp_DTL <= '" + searchParams.dateTo + " 23:59:59'");
    if (searchParams.status && searchParams.status > 0)
        conditions.push("Status = " + searchParams.status);
    if (searchParams.batchNumber && searchParams.batchNumber > 0)
        conditions.push("BatchNumber = " + searchParams.batchNumber);

    let whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
    let query = "SELECT *, Status AS BatchStatus, CONVERT(VARCHAR, Timestamp_DTL, 120) AS TimeStr FROM [BatchDB].[dbo].[BatchHistory]" + whereClause + " ORDER BY Timestamp_DTL DESC";
    HMIRuntime.Trace("Query: " + query);

    try {
        let dbConn = await HMIRuntime.Database.CreateConnection(DB_CONNECTION_STRING);
        let response = await dbConn.Execute(query);
        if (response.GlobalError !== 0) { return []; }

        let rows = mapBatchHistoryRows(response.Results[0].Rows);
        HMIRuntime.Trace("Found " + rows.length + " rows.");
        return rows;
    } catch (err) {
        HMIRuntime.Trace("SEARCH FAILED: " + err.message);
        return [];
    }
}

// 13. XUẤT EXCEL CHI TIẾT SẢN XUẤT THEO CA CHẠY (TỪNG CÂN)
// Gắn hàm này vào Sự kiện (Events) -> On Click của nút "Export Excel" trên HMI
// Helper: Lấy dữ liệu chi tiết lịch sử từ SQL theo bộ lọc năm / tháng
export async function GetDetailedHistoryByFilter(year, month) {
    let conditions = [];
    if (year && year > 0) {
        conditions.push("YEAR(Timestamp_DTL) = " + year);
    }
    if (month && month > 0) {
        conditions.push("MONTH(Timestamp_DTL) = " + month);
    }
    let whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
    let query = "SELECT *, Status AS BatchStatus, CONVERT(VARCHAR, Timestamp_DTL, 120) AS TimeStr FROM [BatchDB].[dbo].[BatchHistory]" + whereClause + " ORDER BY Timestamp_DTL DESC";
    HMIRuntime.Trace("Detailed Filter Query: " + query);

    try {
        let dbConn = await HMIRuntime.Database.CreateConnection(DB_CONNECTION_STRING);
        let response = await dbConn.Execute(query);
        if (response.GlobalError !== 0) {
            HMIRuntime.Trace("Detailed Filter SQL Error: " + response.GlobalError);
            return [];
        }
        let rows = mapBatchHistoryRows(response.Results[0].Rows);
        return rows;
    } catch (err) {
        HMIRuntime.Trace("GetDetailedHistoryByFilter FAILED: " + err.message);
        return [];
    }
}

// Helper: Xây dựng cấu trúc HTML báo cáo chi tiết sản xuất (giả Excel) dùng chung
function buildDetailedHistoryHTML(dataList, titleText) {
    let htmlExcel = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; }
    .table-container { border-collapse: collapse; width: 100%; }
    .title-row { text-align: center; font-size: 20px; font-weight: bold; background-color: #1F4E78; color: #FFFFFF; height: 50px; vertical-align: middle; border: 1px solid #1F4E78; }
    .header-main { font-weight: bold; text-align: center; background-color: #2F5597; color: white; border: 1px solid #1F4E78; height: 35px; vertical-align: middle; font-size: 11px; }
    .header-sub { font-weight: bold; text-align: center; background-color: #4472C4; color: white; border: 1px solid #2F5597; height: 28px; vertical-align: middle; font-size: 10px; }
    .cell-center { text-align: center; border: 1px solid #D9D9D9; vertical-align: middle; height: 30px; font-size: 11px; }
    .cell-text { text-align: left; border: 1px solid #D9D9D9; vertical-align: middle; padding-left: 5px; font-size: 11px; }
    .cell-num { text-align: right; border: 1px solid #D9D9D9; vertical-align: middle; padding-right: 5px; font-size: 11px; font-weight: bold; }
    .cell-num-target { text-align: right; border: 1px solid #D9D9D9; vertical-align: middle; padding-right: 5px; font-size: 11px; color: #595959; }
    .cell-num-actual { text-align: right; border: 1px solid #D9D9D9; vertical-align: middle; padding-right: 5px; font-size: 11px; color: #0070C0; font-weight: bold; }
    .row-even { background-color: #F2F2F2; }
    .row-odd { background-color: #FFFFFF; }
    .footer-note { color: #7F7F7F; font-style: italic; font-size: 11px; margin-top: 15px; }
</style>
</head>
<body>
<table class="table-container">
    <!-- Dòng tiêu đề chính -->
    <tr>
        <td colspan="24" class="title-row">${titleText}</td>
    </tr>
    <tr>
        <td colspan="24" style="height: 10px;"></td>
    </tr>
    
    <!-- Tiêu đề cột hai tầng -->
    <tr>
        <th class="header-main" rowspan="2">STT</th>
        <th class="header-main" rowspan="2">Mã Ca (Recipe)</th>
        <th class="header-main" rowspan="2">Số Ca (Batch)</th>
        <th class="header-main" rowspan="2">Tổng M.Tiêu (kg)</th>
        <th class="header-main" rowspan="2">Tổng T.Tế (kg)</th>
        <th class="header-main" rowspan="2">Sai Lệch (kg)</th>
        <th class="header-main" rowspan="2">Trạng Thái</th>
        <th class="header-main" rowspan="2">Lỗi (lần)</th>
        <th class="header-main" rowspan="2">Thời Gian Chạy</th>
        <th class="header-main" rowspan="2">Thời Gian Hoàn Thành</th>
        <th class="header-main" colspan="2">CÂN 1</th>
        <th class="header-main" colspan="2">CÂN 2</th>
        <th class="header-main" colspan="2">CÂN 3</th>
        <th class="header-main" colspan="2">CÂN 4</th>
        <th class="header-main" colspan="2">CÂN 5</th>
        <th class="header-main" colspan="2">CÂN 6</th>
        <th class="header-main" colspan="2">CÂN 7</th>
    </tr>
    <tr>
        <!-- Cân 1 -->
        <th class="header-sub">M.Tiêu</th>
        <th class="header-sub">T.Tế</th>
        <!-- Cân 2 -->
        <th class="header-sub">M.Tiêu</th>
        <th class="header-sub">T.Tế</th>
        <!-- Cân 3 -->
        <th class="header-sub">M.Tiêu</th>
        <th class="header-sub">T.Tế</th>
        <!-- Cân 4 -->
        <th class="header-sub">M.Tiêu</th>
        <th class="header-sub">T.Tế</th>
        <!-- Cân 5 -->
        <th class="header-sub">M.Tiêu</th>
        <th class="header-sub">T.Tế</th>
        <!-- Cân 6 -->
        <th class="header-sub">M.Tiêu</th>
        <th class="header-sub">T.Tế</th>
        <!-- Cân 7 -->
        <th class="header-sub">M.Tiêu</th>
        <th class="header-sub">T.Tế</th>
    </tr>
`;

    for (let i = 0; i < dataList.length; i++) {
        let r = dataList[i];
        let rowClass = (i % 2 === 0) ? "row-odd" : "row-even";

        let safeBatchID = r.BatchID ? String(r.BatchID) : "";
        let safeTime = r.Time ? String(r.Time) : "";

        let statusVal = (r.Status !== undefined && r.Status !== null) ? Number(r.Status) : 0;
        let statusText = "Không xác định";
        if (statusVal === 1) statusText = "Hoàn thành";
        else if (statusVal === 2) statusText = "Bị hủy";
        else if (statusVal === 3) statusText = "Báo lỗi";

        let targetWeight = (r.Target !== undefined && r.Target !== null) ? Number(r.Target).toFixed(1) : "0.0";
        let actualWeight = (r.Actual !== undefined && r.Actual !== null) ? Number(r.Actual).toFixed(1) : "0.0";
        let devKg = (r.Dev !== undefined && r.Dev !== null) ? Number(r.Dev).toFixed(1) : "0.0";
        let errorVal = Number(r.ErrorCount) || 0;

        let f1_T = (r.F1_Target !== undefined && r.F1_Target !== null) ? Number(r.F1_Target).toFixed(1) : "0.0";
        let f1_A = (r.F1_Actual !== undefined && r.F1_Actual !== null) ? Number(r.F1_Actual).toFixed(1) : "0.0";

        let f2_T = (r.F2_Target !== undefined && r.F2_Target !== null) ? Number(r.F2_Target).toFixed(1) : "0.0";
        let f2_A = (r.F2_Actual !== undefined && r.F2_Actual !== null) ? Number(r.F2_Actual).toFixed(1) : "0.0";

        let f3_T = (r.F3_Target !== undefined && r.F3_Target !== null) ? Number(r.F3_Target).toFixed(1) : "0.0";
        let f3_A = (r.F3_Actual !== undefined && r.F3_Actual !== null) ? Number(r.F3_Actual).toFixed(1) : "0.0";

        let f4_T = (r.F4_Target !== undefined && r.F4_Target !== null) ? Number(r.F4_Target).toFixed(1) : "0.0";
        let f4_A = (r.F4_Actual !== undefined && r.F4_Actual !== null) ? Number(r.F4_Actual).toFixed(1) : "0.0";

        let f5_T = (r.F5_Target !== undefined && r.F5_Target !== null) ? Number(r.F5_Target).toFixed(1) : "0.0";
        let f5_A = (r.F5_Actual !== undefined && r.F5_Actual !== null) ? Number(r.F5_Actual).toFixed(1) : "0.0";

        let f6_T = (r.F6_Target !== undefined && r.F6_Target !== null) ? Number(r.F6_Target).toFixed(1) : "0.0";
        let f6_A = (r.F6_Actual !== undefined && r.F6_Actual !== null) ? Number(r.F6_Actual).toFixed(1) : "0.0";

        let f7_T = (r.F7_Target !== undefined && r.F7_Target !== null) ? Number(r.F7_Target).toFixed(1) : "0.0";
        let f7_A = (r.F7_Actual !== undefined && r.F7_Actual !== null) ? Number(r.F7_Actual).toFixed(1) : "0.0";

        htmlExcel += `
    <tr class="${rowClass}">
        <td class="cell-center" style="font-weight: bold;">${i + 1}</td>
        <td class="cell-text">${safeBatchID}</td>
        <td class="cell-center">${r.BatchNumber || 0}</td>
        <td class="cell-num">${targetWeight}</td>
        <td class="cell-num">${actualWeight}</td>
        <td class="cell-center" style="font-weight: bold; color: ${Math.abs(Number(r.Dev)) > 5.0 ? '#C00000' : '#000000'};">${devKg}</td>
        <td class="cell-center" style="font-weight: bold; font-size: 11px; color: ${statusVal === 1 ? '#00B050' : (statusVal === 2 || statusVal === 3 ? '#C00000' : '#000000')};">${statusText}</td>
        <td class="cell-center" style="color: ${errorVal > 0 ? '#C00000' : '#000000'};">${errorVal > 0 ? errorVal : '-'}</td>
        <td class="cell-center">${r.Duration || "00:00:00"}</td>
        <td class="cell-center">${safeTime}</td>
        
        <!-- Cân 1 -->
        <td class="cell-num-target">${f1_T}</td>
        <td class="cell-num-actual">${f1_A}</td>
        <!-- Cân 2 -->
        <td class="cell-num-target">${f2_T}</td>
        <td class="cell-num-actual">${f2_A}</td>
        <!-- Cân 3 -->
        <td class="cell-num-target">${f3_T}</td>
        <td class="cell-num-actual">${f3_A}</td>
        <!-- Cân 4 -->
        <td class="cell-num-target">${f4_T}</td>
        <td class="cell-num-actual">${f4_A}</td>
        <!-- Cân 5 -->
        <td class="cell-num-target">${f5_T}</td>
        <td class="cell-num-actual">${f5_A}</td>
        <!-- Cân 6 -->
        <td class="cell-num-target">${f6_T}</td>
        <td class="cell-num-actual">${f6_A}</td>
        <!-- Cân 7 -->
        <td class="cell-num-target">${f7_T}</td>
        <td class="cell-num-actual">${f7_A}</td>
    </tr>`;
    }

    htmlExcel += `
</table>
<p class="footer-note">Dữ liệu báo cáo lịch sử được kết xuất tự động từ hệ thống TIA Portal WinCC Unified SCADA - Anh Minh Automation</p>
</body>
</html>`;
    return htmlExcel;
}

// ======================================================================
// HÀM HỖ TRỢ: THÔNG BÁO VÀ TỰ ĐỘNG MỞ FILE EXCEL TRÊN HMI
// ======================================================================
export async function OpenFileAndShowStatus(screen, filePath) {
    try {
        let s = screen || _screenRef || getActiveScreen();
        let winPath = filePath.replace(/\//g, "\\"); // Đổi dấu / sang \ theo chuẩn Windows
        let fileName = winPath.substring(winPath.lastIndexOf("\\") + 1);

        // 1. Đọc tên máy chủ HMI hiện tại để dựng URL động, hoạt động trên mọi PC/Sim
        let hostName = "localhost";
        try {
            let tag = Tags("@LocalMachineName");
            if (tag) {
                hostName = tag.Read() || "localhost";
            }
        } catch (e) {
            HMIRuntime.Trace("Lấy LocalMachineName thất bại: " + e.message);
        }

        // Tạo URL chuẩn HTTPS truy cập qua IIS Virtual Directory (BaoCao) trỏ đến D:\Installer
        let webUrl = "https://" + hostName + "/BaoCao/" + fileName;
        HMIRuntime.Trace("Đường dẫn Web URL báo cáo (Virtual Directory): " + webUrl);

        if (s) {
            // 2. Tìm ô Text Box để hiển thị thông báo thành công
            let txtStatus = s.FindItem("txtExportStatus") || s.FindItem("txtNotify");
            if (txtStatus) {
                txtStatus.Text = "Xuất báo cáo thành công! Đang hiển thị...";
                txtStatus.Visible = true;
                
                // Tự động ẩn thông báo sau 6 giây
                HMIRuntime.Timers.SetTimeout(() => {
                    txtStatus.Visible = false;
                }, 6000);
            }

            // 3. Tìm đối tượng Web Control trực tiếp trên màn hình hiện tại (để tương thích ngược)
            let htmlViewer = s.FindItem("htmlViewer") || s.FindItem("WebControl_1") || s.FindItem("reportViewer");
            if (htmlViewer) {
                htmlViewer.URL = webUrl;
                HMIRuntime.Trace("Đã gán URL trực tiếp cho Web Control thành công!");
            }
        }

        // 4. GIẢI PHÁP ĐỘT PHÁ & LIÊN KẾT TAG ĐỘNG: Ghi URL vào Internal Tag của HMI
        // Nhờ mối liên kết giữa Tag này và thuộc tính URL của Web Control trong TIA Portal,
        // Web Control sẽ tự động cập nhật báo cáo mới ở bất cứ màn hình nào, không sợ sai phân cấp!
        try {
            let tagUrl = Tags(TAG_REPORT_URL);
            if (tagUrl) {
                tagUrl.Write(webUrl);
                HMIRuntime.Trace("Đã ghi Web URL vào Internal Tag '" + TAG_REPORT_URL + "' thành công!");
            }
        } catch (tagErr) {
            HMIRuntime.Trace("Lỗi khi ghi vào Tag " + TAG_REPORT_URL + ": " + tagErr.message);
        }

    } catch (err) {
        HMIRuntime.Trace("Lỗi khi hiển thị báo cáo: " + err.message);
    }
}

// 13. XUẤT EXCEL CHI TIẾT SẢN XUẤT THEO CA CHẠY (TỪNG CÂN)
// Gắn hàm này vào Sự kiện (Events) -> On Click của nút "Export Excel" trên HMI
export async function ExportHistoryToExcel(screen) {
    HMIRuntime.Trace("=== Bắt đầu xuất báo cáo Lịch sử Chi tiết ===");
    try {
        let s = screen || _screenRef || getActiveScreen();
        let state = getScreenState(s);
        let dataList = state ? state.cachedData : cachedData;

        if (!dataList || dataList.length === 0) {
            HMIRuntime.Trace("Export: Không có dữ liệu để xuất.");
            return;
        }

        let htmlExcel = buildDetailedHistoryHTML(dataList, "BÁO CÁO CHI TIẾT SẢN XUẤT THEO CA CHẠY");

        // Tạo tên file tự động theo thời gian
        let timestampStr = getFormattedTimestamp(true);

        // Đường dẫn lưu file trên máy chủ HMI
        let filePath = EXPORT_FOLDER + "BaoCaoLichSu_ChiTiet_" + timestampStr + ".html";

        // Sử dụng API FileSystem của WinCC Unified để ghi file
        await HMIRuntime.FileSystem.WriteFile(filePath, htmlExcel, "utf8");

        HMIRuntime.Trace("Xuất báo cáo Lịch sử thành công! Đường dẫn: " + filePath);

        // Gọi hàm tự động thông báo và mở file Excel
        await OpenFileAndShowStatus(s, filePath);

    } catch (e) {
        let errorMsg = e.message || e.Message || String(e);
        HMIRuntime.Trace("Lỗi xuất báo cáo Lịch sử: " + errorMsg);
    }
}

// 13b. XUẤT EXCEL CHI TIẾT SẢN XUẤT THEO THÁNG (ĐẦY ĐỦ CHI TIẾT & 7 CÂN)
export async function ExportDetailedMonthlyToExcel(screen, yearFilter, monthFilter) {
    HMIRuntime.Trace("=== Bắt đầu xuất Chi tiết Lịch sử theo Tháng ===");
    try {
        let s = screen || _screenRef || getActiveScreen();
        if (!yearFilter || yearFilter === 0) {
            let yTag = Tags(TAG_FILTER_YEAR);
            yearFilter = (yTag && yTag.Read() > 0) ? yTag.Read() : new Date().getFullYear();
        }
        if (!monthFilter || monthFilter === 0) {
            let mTag = Tags(TAG_FILTER_MONTH);
            monthFilter = (mTag && mTag.Read() > 0) ? mTag.Read() : (new Date().getMonth() + 1);
        }

        HMIRuntime.Trace("Querying detailed monthly history for Month=" + monthFilter + " Year=" + yearFilter);
        let data = await GetDetailedHistoryByFilter(yearFilter, monthFilter);

        if (!data || data.length === 0) {
            HMIRuntime.Trace("ExportDetailedMonthly: Không có dữ liệu để xuất.");
            return;
        }

        let htmlExcel = buildDetailedHistoryHTML(data, "BÁO CÁO CHI TIẾT SẢN XUẤT - THÁNG " + monthFilter + "/" + yearFilter);

        let ts = getFormattedTimestamp(false);
        let filePath = EXPORT_FOLDER + "BaoCaoChiTiet_Thang_" + monthFilter + "_" + yearFilter + "_" + ts + ".html";

        await HMIRuntime.FileSystem.WriteFile(filePath, htmlExcel, "utf8");
        HMIRuntime.Trace("Xuất báo cáo chi tiết tháng thành công! Đường dẫn: " + filePath);

        // Gọi hàm tự động thông báo và mở file Excel
        await OpenFileAndShowStatus(s, filePath);
    } catch (e) {
        HMIRuntime.Trace("Lỗi xuất chi tiết tháng: " + (e.message || String(e)));
    }
}

// 13c. XUẤT EXCEL CHI TIẾT SẢN XUẤT THEO NĂM (ĐẦY ĐỦ CHI TIẾT & 7 CÂN)
export async function ExportDetailedYearlyToExcel(screen, yearFilter) {
    HMIRuntime.Trace("=== Bắt đầu xuất Chi tiết Lịch sử theo Năm ===");
    try {
        let s = screen || _screenRef || getActiveScreen();
        if (!yearFilter || yearFilter === 0) {
            let yTag = Tags(TAG_FILTER_YEAR);
            yearFilter = (yTag && yTag.Read() > 0) ? yTag.Read() : new Date().getFullYear();
        }

        HMIRuntime.Trace("Querying detailed yearly history for Year=" + yearFilter);
        let data = await GetDetailedHistoryByFilter(yearFilter, 0);

        if (!data || data.length === 0) {
            HMIRuntime.Trace("ExportDetailedYearly: Không có dữ liệu để xuất.");
            return;
        }

        let htmlExcel = buildDetailedHistoryHTML(data, "BÁO CÁO CHI TIẾT SẢN XUẤT - NĂM " + yearFilter);

        let ts = getFormattedTimestamp(false);
        let filePath = EXPORT_FOLDER + "BaoCaoChiTiet_Nam_" + yearFilter + "_" + ts + ".html";

        await HMIRuntime.FileSystem.WriteFile(filePath, htmlExcel, "utf8");
        HMIRuntime.Trace("Xuất báo cáo chi tiết năm thành công! Đường dẫn: " + filePath);

        // Gọi hàm tự động thông báo và mở file Excel
        await OpenFileAndShowStatus(s, filePath);
    } catch (e) {
        HMIRuntime.Trace("Lỗi xuất chi tiết năm: " + (e.message || String(e)));
    }
}

// 13d. CÁC HÀM XUẤT BÁO CÁO THÁNG / NĂM CHI TIẾT (NGƯỜI DÙNG GỌI TRỰC TIẾP)
export async function ExportMonthlyToExcel(screen, yearFilter, monthFilter) {
    return await ExportDetailedMonthlyToExcel(screen, yearFilter, monthFilter);
}

export async function ExportYearlyToExcel(screen, yearFilter) {
    return await ExportDetailedYearlyToExcel(screen, yearFilter);
}

// 14. XUẤT EXCEL CHI TIẾT DỮ LIỆU CỦA MẺ "HIỆN TẠI" (Bản nằm ngang 24 cột đồng bộ với Lịch Sử)
// Gắn vào Sự kiện Click của nút "Xuất Mẻ Hiện Tại" trên HMI
export async function ExportCurrentBatchToExcel(screen) {
    HMIRuntime.Trace("=== Bắt đầu xuất chi tiết Mẻ hiện tại (24 cột) ===");
    try {
        function getTagVal(tagName) {
            let t = Tags(tagName);
            return t ? (t.Read() || 0) : 0;
        }
        function getTagStr(tagName) {
            let t = Tags(tagName);
            return t ? (t.Read() || "") : "";
        }

        // 1. Đọc số liệu tổng quan của máy từ PLC sử dụng hằng số cấu hình
        let batchID = getTagStr(TAG_LIVE_BATCH_ID) || "---";
        let elapsedTime = getTagVal(TAG_LIVE_ELAPSED_TIME);
        let batchNumber = getTagVal(TAG_LIVE_BATCH_NUMBER) || getTagVal(TAG_LIVE_ACTUAL_BATCH_NUM) || 1;

        let formattedTime = formatDuration(elapsedTime / 10000000);

        // 2. Đọc dữ liệu chi tiết của 7 Cân và áp dụng Dynamic Unit Auto-Scaling
        let sumFeederActuals = 0;
        let fTargets = []; // lưu trữ phần trăm tạm thời, sau đó tính theo scaleFactor
        let fActuals = [];
        let errorVal = 0;

        for (let i = 0; i < 7; i++) {
            let percent = getTagVal(`${TAG_LIVE_MATERIAL_PERCENTS}[${i}]`) || 0;
            fTargets.push(percent); // Lưu phần trăm tạm thời
            let actual = Number(getTagVal(`${TAG_LIVE_FEEDERS_DETAIL}[${i}].Totalized_Weight`)) || 0;
            sumFeederActuals += actual;
            let isFault = getTagVal(`${TAG_LIVE_FEEDERS_DETAIL}[${i}].Fault`);

            if (isFault) {
                errorVal++;
            }
            fActuals.push(actual);
        }

        // Tính toán tỷ lệ co giãn đo lường (scale factor)
        let actualTotalVal = getTagVal(TAG_LIVE_ACTUAL_TOTAL_WEIGHT);
        let targetTotalVal = getTagVal(TAG_LIVE_TARGET_PRODUCTION);
        let scaleFactor = 1.0;

        if (sumFeederActuals > 0 && actualTotalVal > 0 && actualTotalVal < (sumFeederActuals / 100.0)) {
            scaleFactor = 1000.0;
        } else if (sumFeederActuals === 0) {
            if (targetTotalVal > 0 && targetTotalVal < 50) {
                scaleFactor = 1000.0;
            }
        }

        let targetTotal = targetTotalVal * scaleFactor;
        let actualTotal = actualTotalVal * scaleFactor;

        // Tính toán target cân dựa trên tổng target đã co giãn và phần trăm công thức
        for (let i = 0; i < 7; i++) {
            fTargets[i] = Number(targetTotal * (fTargets[i] / 100)) || 0;
        }

        // Tính toán sai lệch (%) và trạng thái của mẻ hiện tại
        let devVal = targetTotal > 0 ? (((actualTotal - targetTotal) / targetTotal) * 100) : 0;
        let statusVal = errorVal > 0 ? 3 : 1; // 3 = Báo lỗi, 1 = Hoàn thành (hoặc Đang chạy)

        // Đọc bản ghi mới nhất trong DB_BatchLog_Records để xem có thông tin trạng thái chính xác hay không (đặc biệt khi bị HỦY)
        try {
            let writeIndexTag = Tags(TAG_BATCHLOG_WRITE_INDEX);
            if (writeIndexTag) {
                let writeIndex = writeIndexTag.Read() || 0;
                if (writeIndex >= 1 && writeIndex <= 20) {
                    let recordIndex_PLC = (writeIndex === 1) ? 20 : (writeIndex - 1);
                    let recordIndex_HMI = recordIndex_PLC - 1;

                    let logTagBase = TAG_BATCHLOG_RECORDS_BASE + "[" + recordIndex_HMI + "]";
                    let logBatchIDTag = Tags(logTagBase + ".BatchID");
                    let logBatchNumTag = Tags(logTagBase + ".BatchNumber");
                    let logStatusTag = Tags(logTagBase + ".Status");

                    if (logBatchIDTag && logBatchNumTag && logStatusTag) {
                        let logBatchID = logBatchIDTag.Read() || "";
                        let logBatchNum = logBatchNumTag.Read() || 0;
                        let logStatus = Number(logStatusTag.Read()) || 0;

                        // Nếu bản ghi mới nhất trong log khớp với BatchID và BatchNumber hiện tại
                        if (logBatchID === batchID && logBatchNum === batchNumber) {
                            if (logStatus === 1 || logStatus === 2 || logStatus === 3) {
                                statusVal = logStatus;
                                HMIRuntime.Trace(`Lấy trạng thái mẻ từ PLC Log: Status = ${statusVal}`);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            HMIRuntime.Trace("Lỗi đọc trạng thái mẻ từ PLC Log: " + err.message);
        }

        // 3. Tạo mảng chứa duy nhất 1 bản ghi của mẻ hiện tại
        let dataList = [{
            Id: 1,
            BatchID: batchID,
            BatchNumber: batchNumber,
            Target: targetTotal,
            Actual: actualTotal,
            Dev: devVal,
            Status: statusVal,
            ErrorCount: errorVal,
            Duration: formattedTime,
            Time: formatTimestamp(new Date()),

            F1_Target: fTargets[0], F1_Actual: fActuals[0],
            F2_Target: fTargets[1], F2_Actual: fActuals[1],
            F3_Target: fTargets[2], F3_Actual: fActuals[2],
            F4_Target: fTargets[3], F4_Actual: fActuals[3],
            F5_Target: fTargets[4], F5_Actual: fActuals[4],
            F6_Target: fTargets[5], F6_Actual: fActuals[5],
            F7_Target: fTargets[6], F7_Actual: fActuals[6]
        }];

        // 4. Xây dựng nội dung HTML Excel (24 cột chuyên nghiệp) bằng hàm dùng chung
        let htmlExcel = buildDetailedHistoryHTML(dataList, "BÁO CÁO CHI TIẾT SẢN XUẤT MẺ HIỆN TẠI");

        // 5. Đặt tên file và ghi dữ liệu ra bộ nhớ HMI
        let timestampStr = getFormattedTimestamp(true);

        let filePath = EXPORT_FOLDER + "BaoCao_LIVE_ChiTiet_" + timestampStr + ".html";

        await HMIRuntime.FileSystem.WriteFile(filePath, htmlExcel, "utf8");
        HMIRuntime.Trace("Xuất mẻ LIVE chi tiết thành công! Đường dẫn: " + filePath);

        // Gọi hàm tự động thông báo và mở file Excel
        let s = screen || _screenRef || getActiveScreen();
        await OpenFileAndShowStatus(s, filePath);

    } catch (e) {
        let errorMsg = e.message || e.Message || String(e);
        HMIRuntime.Trace("Lỗi xuất báo cáo Mẻ Hiện Tại chi tiết: " + errorMsg);
    }
}

// ======================================================================
// 15. TỔNG HỢP SỐ LIỆU THEO THÁNG
// ======================================================================
// Truy vấn SQL tổng hợp theo tháng từ bảng BatchHistory
// Trả về mảng: { Year, Month, TotalBatches, TotalWeight, AvgDeviation,
//                TotalErrors, TotalDuration_sec, OkCount, AbortCount }
export async function GetMonthlyStats(yearFilter) {
    HMIRuntime.Trace("=== GetMonthlyStats: Querying monthly aggregation ===");
    let whereClause = (yearFilter && yearFilter > 0)
        ? "WHERE YEAR(Timestamp_DTL) = " + yearFilter
        : "";

    let query =
        "SELECT" +
        "  YEAR(Timestamp_DTL)  AS [Year]," +
        "  MONTH(Timestamp_DTL) AS [Month]," +
        "  COUNT(*)             AS TotalBatches," +
        "  SUM(Actual_Weight)   AS TotalWeight," +
        "  AVG(Deviation_Pct)   AS AvgDeviation," +
        "  SUM(Error_Count)     AS TotalErrors," +
        "  SUM(Duration_sec)    AS TotalDuration_sec," +
        "  SUM(CASE WHEN Status = 1 THEN 1 ELSE 0 END) AS OkCount," +
        "  SUM(CASE WHEN Status = 2 THEN 1 ELSE 0 END) AS AbortCount" +
        " FROM [BatchDB].[dbo].[BatchHistory]" +
        " " + whereClause +
        " GROUP BY YEAR(Timestamp_DTL), MONTH(Timestamp_DTL)" +
        " ORDER BY [Year] DESC, [Month] DESC";

    try {
        let dbConn = await HMIRuntime.Database.CreateConnection(DB_CONNECTION_STRING);
        let response = await dbConn.Execute(query);
        if (response.GlobalError !== 0) {
            HMIRuntime.Trace("GetMonthlyStats SQL Error: GlobalError=" + response.GlobalError);
            return [];
        }
        let dataRows = response.Results[0].Rows;
        let rows = [];
        for (let k in dataRows) {
            let r = dataRows[k];
            rows.push({
                Year: Number(r.Year),
                Month: Number(r.Month),
                TotalBatches: Number(r.TotalBatches) || 0,
                TotalWeight: Number(r.TotalWeight) || 0,
                AvgDeviation: Number(r.AvgDeviation) || 0,
                TotalErrors: Number(r.TotalErrors) || 0,
                TotalDuration_sec: Number(r.TotalDuration_sec) || 0,
                OkCount: Number(r.OkCount) || 0,
                AbortCount: Number(r.AbortCount) || 0
            });
        }
        HMIRuntime.Trace("GetMonthlyStats: Got " + rows.length + " months.");
        return rows;
    } catch (err) {
        HMIRuntime.Trace("GetMonthlyStats FAILED: " + err.message);
        return [];
    }
}

// ======================================================================
// 16. XUẤT BÁO CÁO TỔNG HỢP THÁNG RA EXCEL
// ======================================================================
// Gắn hàm này vào On Click của nút "Báo cáo tháng" trên HMI
// yearFilter: số năm cần lọc (ví dụ 2026), hoặc 0 để lấy tất cả năm
// Nếu trên HMI có tag "Filter_Year", script sẽ đọc tự động
export async function ExportMonthlyStatsToExcel(screen, yearFilter) {
    HMIRuntime.Trace("=== Bắt đầu xuất Báo cáo Tổng hợp Tháng ===");
    try {
        if (!yearFilter || yearFilter === 0) {
            let yTag = Tags(TAG_FILTER_YEAR);
            yearFilter = (yTag && yTag.Read() > 0) ? yTag.Read() : new Date().getFullYear();
        }

        let data = await GetMonthlyStats(yearFilter);
        if (!data || data.length === 0) {
            HMIRuntime.Trace("ExportMonthlyStats: Không có dữ liệu để xuất.");
            return;
        }

        function fmtHours(totalSec) {
            let h = Math.floor(totalSec / 3600);
            let m = Math.floor((totalSec % 3600) / 60);
            return h + 'h ' + (m < 10 ? '0' + m : m) + 'm';
        }

        const monthNames = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
            'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
            'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

        let gt = data.reduce((acc, r) => {
            acc.TotalBatches += r.TotalBatches;
            acc.TotalWeight += r.TotalWeight;
            acc.TotalErrors += r.TotalErrors;
            acc.TotalDuration_sec += r.TotalDuration_sec;
            acc.OkCount += r.OkCount;
            acc.AbortCount += r.AbortCount;
            return acc;
        }, { TotalBatches: 0, TotalWeight: 0, TotalErrors: 0, TotalDuration_sec: 0, OkCount: 0, AbortCount: 0 });

        let now2 = new Date();
        let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; }
    .table-container { border-collapse: collapse; width: 100%; max-width: 900px; }
    .title-row { text-align: center; font-size: 20px; font-weight: bold; background-color: #1F4E78; color: #FFFFFF; height: 50px; vertical-align: middle; border: 1px solid #1F4E78; }
    .sub-row { text-align: center; font-size: 11px; background-color: #1F4E78; color: #BDD7EE; height: 25px; vertical-align: middle; border: 1px solid #1F4E78; padding-bottom: 5px; }
    .header-main { font-weight: bold; text-align: center; background-color: #2F5597; color: white; border: 1px solid #1F4E78; height: 35px; vertical-align: middle; font-size: 11px; }
    .cell-center { text-align: center; border: 1px solid #D9D9D9; vertical-align: middle; height: 30px; font-size: 11px; }
    .cell-text { text-align: left; border: 1px solid #D9D9D9; vertical-align: middle; padding-left: 10px; font-size: 11px; font-weight: bold; color: #1F4E78; }
    .cell-num { text-align: right; border: 1px solid #D9D9D9; vertical-align: middle; padding-right: 10px; font-size: 11px; font-weight: bold; color: #0070C0; }
    .cell-ok { text-align: center; border: 1px solid #D9D9D9; vertical-align: middle; color: #00B050; font-weight: bold; font-size: 11px; }
    .cell-err { text-align: center; border: 1px solid #D9D9D9; vertical-align: middle; color: #C00000; font-weight: bold; font-size: 11px; }
    .cell-total-label { font-weight: bold; text-align: left; padding-left: 10px; background-color: #FFF2CC; border: 2px solid #FFD700; vertical-align: middle; height: 35px; color: #7030A0; font-size: 11px; }
    .cell-total-num { font-weight: bold; text-align: center; background-color: #FFF2CC; border: 2px solid #FFD700; vertical-align: middle; color: #7030A0; font-size: 11px; }
    .row-even { background-color: #F2F2F2; }
    .row-odd { background-color: #FFFFFF; }
    .footer-note { color: #7F7F7F; font-style: italic; font-size: 11px; margin-top: 15px; }
</style>
</head>
<body>
<table class="table-container">
    <tr>
        <td colspan="8" class="title-row">BÁO CÁO TỔNG HỢP SẢN XUẤT THEO THÁNG</td>
    </tr>
    <tr>
        <td colspan="8" class="sub-row">Năm ${yearFilter} | Xuất lúc: ${now2.toLocaleString('vi-VN')}</td>
    </tr>
    <tr>
        <td colspan="8" style="height: 10px;"></td>
    </tr>
    <tr>
        <th class="header-main" style="width: 15%;">Tháng</th>
        <th class="header-main" style="width: 10%;">Số Mẻ</th>
        <th class="header-main" style="width: 15%;">Tổng Sản Lượng (kg)</th>
        <th class="header-main" style="width: 12%;">Lệch TB (%)</th>
        <th class="header-main" style="width: 10%;">Mẻ OK</th>
        <th class="header-main" style="width: 10%;">Mẻ Hủy</th>
        <th class="header-main" style="width: 10%;">Tổng Lỗi</th>
        <th class="header-main" style="width: 18%;">Thời Gian Chạy</th>
    </tr>`;

        for (let i = 0; i < data.length; i++) {
            let r = data[i];
            let rowClass = (i % 2 === 0) ? "row-odd" : "row-even";
            html += `
    <tr class="${rowClass}">
        <td class="cell-text">${monthNames[r.Month]} ${r.Year}</td>
        <td class="cell-center" style="font-weight: bold;">${r.TotalBatches}</td>
        <td class="cell-num">${r.TotalWeight.toFixed(1)}</td>
        <td class="cell-center" style="font-weight: bold; color: ${Math.abs(r.AvgDeviation) > 5 ? '#C00000' : '#00B050'};">${r.AvgDeviation.toFixed(2)}</td>
        <td class="cell-ok">${r.OkCount}</td>
        <td class="cell-center" style="font-weight: bold; color: ${r.AbortCount > 0 ? '#C00000' : '#0070C0'};">${r.AbortCount > 0 ? r.AbortCount : '-'}</td>
        <td class="cell-err">${r.TotalErrors > 0 ? r.TotalErrors : '-'}</td>
        <td class="cell-center">${fmtHours(r.TotalDuration_sec)}</td>
    </tr>`;
        }

        html += `
    <tr>
        <td colspan="8" style="height: 5px;"></td>
    </tr>
    <tr>
        <td class="cell-total-label">TỔNG CỘNG NĂM ${yearFilter}</td>
        <td class="cell-total-num">${gt.TotalBatches}</td>
        <td class="cell-total-num" style="text-align: right; padding-right: 10px;">${gt.TotalWeight.toFixed(1)}</td>
        <td class="cell-total-num">-</td>
        <td class="cell-total-num" style="color: #00B050;">${gt.OkCount}</td>
        <td class="cell-total-num" style="color: ${gt.AbortCount > 0 ? '#C00000' : '#7030A0'};">${gt.AbortCount > 0 ? gt.AbortCount : '-'}</td>
        <td class="cell-total-num" style="color: ${gt.TotalErrors > 0 ? '#C00000' : '#7030A0'};">${gt.TotalErrors > 0 ? gt.TotalErrors : '-'}</td>
        <td class="cell-total-num">${fmtHours(gt.TotalDuration_sec)}</td>
    </tr>
</table>
<p class="footer-note">Dữ liệu báo cáo tổng hợp được kết xuất tự động từ hệ thống TIA Portal WinCC Unified SCADA - Anh Minh Automation</p>
</body>
</html>`;

        let ts2 = getFormattedTimestamp(false);
        let filePath = EXPORT_FOLDER + "BaoCaoThang_" + yearFilter + "_" + ts2 + ".html";

        await HMIRuntime.FileSystem.WriteFile(filePath, html, "utf8");
        HMIRuntime.Trace("Xuất báo cáo tổng hợp tháng thành công! Đường dẫn: " + filePath);

        // Gọi hàm tự động thông báo và mở file Excel trong trình duyệt
        let s = screen || _screenRef || getActiveScreen();
        await OpenFileAndShowStatus(s, filePath);

    } catch (e) {
        HMIRuntime.Trace("Lỗi xuất báo cáo tổng hợp tháng: " + (e.message || String(e)));
    }
}

