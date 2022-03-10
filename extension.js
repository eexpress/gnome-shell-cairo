const { GObject, Clutter, GLib, St, PangoCairo, Pango } = imports.gi;

const Cairo			 = imports.cairo;
const ExtensionUtils = imports.misc.extensionUtils;
const Main			 = imports.ui.main;
const PanelMenu		 = imports.ui.panelMenu;
const PopupMenu		 = imports.ui.popupMenu;
const Me			 = imports.misc.extensionUtils.getCurrentExtension();

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _		  = Gettext.gettext;

const debug = false;
//~ const debug = true;
function lg(s) {
	if (debug) log("===" + Me.metadata['gettext-domain'] + "===>" + s);
}

const xClock	 = Me.imports.Clock.xClock;
const size		 = 400;
let xc			 = null;
let pop_per_hour = false;  //整点弹出报时。
let pt			 = null;

const Indicator = GObject.registerClass(
	class Indicator extends PanelMenu.Button {
		_init() {
			super._init(0.0, _('Cairo Clock'));

			this.add_child(new St.Icon({
				icon_name : 'gnome-panel-clock',
				style_class : 'system-status-icon',
			}));

			xc = new xClock(400);
			Main.layoutManager.addChrome(xc);
			xc.visible	= false;
			xc.reactive = true;

			this.width			  = 50;
			this.background_color = Clutter.Color.from_string("gray")[1];
			this.connect("button-press-event", (actor, event) => {
				const altkey  = event.get_state() & Clutter.ModifierType.MOD1_MASK;
				const ctrlkey = event.get_state() & Clutter.ModifierType.CONTROL_MASK;
				if (altkey) {
					pop_per_hour		  = !pop_per_hour;
					this.background_color = Clutter.Color.from_string(pop_per_hour ? "green" : "gray")[1];
					return Clutter.EVENT_STOP;
				}
				if (ctrlkey) {
					this.alarm();
					return Clutter.EVENT_STOP;
				}
				const [x, y] = global.get_pointer();
				xc.set_position(x - size / 2 + 10, y + 30);
				xc.visible = !xc.visible;
				this.ease_effect(xc);
				return Clutter.EVENT_STOP;
			});
		}

		ease_effect(a) {  //直线位置动画，AnimationMode 只是时间间隔的变化。
			let monitor = Main.layoutManager.primaryMonitor;
			let newX, newO;
			const isV	   = a.visible;
			const [px, py] = global.get_pointer();
			if (isV) {	//从屏幕左侧到鼠标点击下方出现。
				a.set_scale(0.1, 0.1);
				a.set_position(monitor.width / 2, py + 30);
				newX			   = px - size / 2 + 10;
				a.opacity		   = 10;
				newO			   = 255;
				a.rotation_angle_z = 180;
			} else {  //从当前位置到屏幕右侧消失。
				newX	  = monitor.width - size;
				newO	  = 10;
				a.visible = true;  //强制显示，以产生动态。
			}

			a.ease({
				x : newX,
				scale_x : 1,
				scale_y : 1,
				opacity : newO,
				rotation_angle_z : 0,
				duration : 1000,
				mode : Clutter.AnimationMode.EASE_OUT_BOUNCE,
				onComplete : () => {
					if (!isV) a.visible = false;  //恢复应该的状态。
					a.opacity = 255;  //及时恢复透明度。
				}
			});
		};

		alarm() {
			// 因为有动画变换位置，所以强制恢复。
			const [px, py] = global.get_pointer();
			xc.set_position(px - size / 2 + 10, py + 30);

			const player = global.display.get_sound_player();
			player.play_from_theme('complete', 'countdown', null);
			xc.visible = true;
			xc.swing();
		}

		destroy() {
			Main.layoutManager.removeChrome(xc);
			xc.destroy();
			super.destroy();  // Extension point conflict if no destroy.
		}
	});

let timeoutId = null;

class Extension {
	constructor(uuid) {
		this._uuid = uuid;

		ExtensionUtils.initTranslations();
	}

	enable() {
		timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
			const [h, m] = xc.get_alarm();
			const d0	 = new Date();
			const m0	 = d0.getMinutes();
			if (h && m) {
				let h0 = d0.getHours();
				h0 %= 12;
				if (h == h0 && m == m0) this._indicator.alarm();
			}
			if (pop_per_hour) {	 //整点弹出报时
				const s0 = d0.getSeconds();
				if (m0 == 0 && s0 < 10)
					//~ if(s0 < 10)//1分钟测试用
					this._indicator.alarm();
			}
			return GLib.SOURCE_CONTINUE;
		});
		lg("start");
		this._indicator = new Indicator();
		Main.panel.addToStatusArea(this._uuid, this._indicator);
	}

	disable() {
		if (timeoutId) {
			GLib.Source.remove(timeoutId);
			timeoutId = null;
		}
		lg("stop");
		this._indicator.destroy();
		this._indicator = null;
	}
}

function init(meta) {
	return new Extension(meta.uuid);
}
