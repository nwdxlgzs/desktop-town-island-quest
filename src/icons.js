import { createElement, Mouse, Keyboard, Scissors, Camera, Package, Type, Map, BookOpen, ChartNoAxesCombined, Volume2, VolumeX, Maximize, RotateCcw, ArrowUpRight, ArrowRight, ChevronRight, ChevronLeft, Check, X, Sparkles, Trophy, Move, Hand, Clipboard, Copy, Save, Download, CircleHelp, CornerDownLeft, Command, Play, Target, Flag, Sun, Settings, Image, Info, CheckCheck, Menu, Navigation, Star, Monitor, ZoomIn, Send, FileText, KeyRound, Music2, Music, Folder, FolderPlus, ArrowUp } from 'lucide';

const symbols = { mouse:Mouse, keyboard:Keyboard, scissors:Scissors, camera:Camera, package:Package, type:Type, map:Map, book:BookOpen, report:ChartNoAxesCombined, sound:Volume2, mute:VolumeX, music:Music2, 'music-off':Music, fullscreen:Maximize, reset:RotateCcw, external:ArrowUpRight, arrow:ArrowRight, next:ChevronRight, previous:ChevronLeft, check:Check, close:X, sparkles:Sparkles, trophy:Trophy, move:Move, hand:Hand, clipboard:Clipboard, copy:Copy, save:Save, download:Download, help:CircleHelp, enter:CornerDownLeft, command:Command, play:Play, target:Target, flag:Flag, sun:Sun, settings:Settings, image:Image, info:Info, checks:CheckCheck, menu:Menu, navigation:Navigation, star:Star, monitor:Monitor, zoom:ZoomIn, send:Send, file:FileText, key:KeyRound };
symbols.folder=Folder;symbols['folder-plus']=FolderPlus;symbols.up=ArrowUp;
export function icon(name, size = 20) {
  return createElement(symbols[name] || symbols.sparkles, { width:size, height:size, 'stroke-width':1.8, 'aria-hidden':'true' }).outerHTML;
}
export function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, s => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[s]));
}
