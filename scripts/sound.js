/**
 * WinCC Unified HMI - Global Scripting Module for Alarm Sound Management
 * File Path: d:\GoogleDrive\Backup\unified_code\scripts\sound.js
 *
 * This script handles HMI buzzer / alarm sound playbacks using WinCC Unified HMIRuntime APIs.
 * It can be imported in any Screen event, Tag change event, or Scheduled task.
 */

/**
 * Plays the alarm sound.
 * @param {string} [soundFile="alarm_horn.wav"] - The name of the sound file in the HMI media directory.
 * @param {number} [loopCount=0] - Number of loops. 0 means loop infinitely until StopSound is called.
 */
export function PlayAlarm(soundFile, loopCount) {
    var file = soundFile || "alarm_horn.wav";
    var loop = (loopCount !== undefined) ? loopCount : 0;
    
    try {
        HMIRuntime.Trace("Sound.js: Playing alarm sound '" + file + "' with loop=" + loop);
        HMIRuntime.UI.SysFct.PlaySound(file, loop);
    } catch (e) {
        HMIRuntime.Trace("Sound.js Error playing alarm: " + e.message);
    }
}

/**
 * Stops any currently playing alarm sound.
 */
export function StopAlarm() {
    try {
        HMIRuntime.Trace("Sound.js: Stopping alarm sound.");
        HMIRuntime.UI.SysFct.StopSound();
    } catch (e) {
        HMIRuntime.Trace("Sound.js Error stopping alarm: " + e.message);
    }
}

/**
 * Evaluates the global system error status and manages the alarm buzzer.
 * Trigger this function on the 'Value change' event of the Tag:
 * "DB_HMI_Data_System_Status_System_Error"
 */
export function EvaluateSystemErrorSound() {
    try {
        // Read the global system error status tag
        var hasError = Tags("DB_HMI_Data_System_Status_System_Error").Read();
        
        if (hasError === true) {
            // Play sound infinitely until resolved/acknowledged
            PlayAlarm("alarm_horn.wav", 0);
        } else {
            // Stop sound when error is resolved
            StopAlarm();
        }
    } catch (e) {
        HMIRuntime.Trace("Sound.js Error evaluating System_Error: " + e.message);
    }
}
