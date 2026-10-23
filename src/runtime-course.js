import {defaultCourse,readCourse,courseFingerprint} from './course-config.js';
export const courseStorageKey='desktop-quest-course-v1';
let course=defaultCourse,courseProblem='';
try{const text=globalThis.localStorage?.getItem(courseStorageKey);if(text){const next=readCourse(text);if(courseFingerprint(next)!==courseFingerprint(defaultCourse))course=next;}}catch(e){courseProblem=`自定义课程未能载入，已使用内置课程：${e.message}`;}
export const courseId=course===defaultCourse?'default':courseFingerprint(course);
export {course,courseProblem};
