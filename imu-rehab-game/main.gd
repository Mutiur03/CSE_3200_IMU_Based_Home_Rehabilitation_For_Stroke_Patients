extends Node3D

# Game State
enum DifficultyLevel {
	LEVEL_1_EASY = 1,     # Brunnstrom III-IV: Reaching-to-Grasp & Forward Extension
	LEVEL_2_MEDIUM = 2,   # Brunnstrom IV-V: Horizontal Abduction/Adduction & Weeding
	LEVEL_3_DIFFICULT = 3 # Brunnstrom V-VI: Coordination & Weather Shielding
}

enum ControlMode {
	HYBRID_AUTO,
	IMU_ONLY,
	MOUSE_ONLY,
	KEYBOARD_ONLY
}

enum ToolMode {
	SOIL_TROWEL,
	HAND_REACH,
	WATERING_CAN,
	PROTECTIVE_SHIELD
}

# Configuration
const REQUIRED_REPS: int = 3
const UDP_PORT: int = 4242

# UI References
@onready var stage_label: Label = %StageLabel
@onready var task_name_label: Label = %TaskName
@onready var task_desc_label: Label = %TaskDesc
@onready var reps_label: Label = %RepsLabel
@onready var timer_label: Label = %TimerLabel
@onready var smoothness_label: Label = %SmoothnessLabel
@onready var posture_errors_label: Label = %PostureErrorsLabel
@onready var imu_status_label: Label = %IMUStatusLabel
@onready var imu_mode_button: Button = %IMUModeButton
@onready var calibrate_button: Button = %CalibrateButton

# Level Intro Dialog
@onready var scrim: ColorRect = $UI/Scrim
@onready var intro_dialog: Control = $UI/IntroDialog
@onready var intro_title: Label = %IntroTitle
@onready var intro_subtitle: Label = %IntroSubtitle
@onready var intro_objective: Label = %IntroObjective
@onready var intro_tasks_list: RichTextLabel = %IntroTasksList
@onready var intro_posture_tip: Label = %IntroPostureTip
@onready var start_level_button: Button = %StartLevelButton

# Overlays & Banners
@onready var warning_overlay: Control = $UI/WarningOverlay
@onready var warning_reason_label: Label = %ReasonLabel
@onready var encouragement_banner: Control = $UI/EncouragementBanner
@onready var encouragement_label: Label = %ToastLabel

# Clinical Summary Dialog
@onready var summary_dialog: Control = $UI/SummaryDialog
@onready var summary_title: Label = %SummaryTitle
@onready var summary_stats_label: RichTextLabel = %SummaryStatsLabel
@onready var summary_tasks_breakdown: RichTextLabel = %SummaryTasksBreakdown
@onready var summary_assessment_label: Label = %SummaryAssessmentLabel
@onready var continue_button: Button = %ContinueButton
@onready var replay_button: Button = %ReplayButton
@onready var export_button: Button = %ExportButton

# 3D World Nodes
@onready var potting_bench: Node3D = $PottingBench
@onready var plant_container: Node3D = $PottingBench/PlantContainer
@onready var seed_station: Node3D = $PottingBench/SeedStation
@onready var watering_can_station: Node3D = $PottingBench/WateringCanStation
@onready var hand_cursor: Node3D = $HandCursor3D
@onready var dynamic_3d_container: Node3D = $Dynamic3DContainer

# 3D Cursor Subnodes
@onready var trowel_node: Node3D = $HandCursor3D/Tools/Trowel
@onready var hand_node: Node3D = $HandCursor3D/Tools/Hand
@onready var watering_can_node: Node3D = $HandCursor3D/Tools/WateringCan
@onready var shield_node: Node3D = $HandCursor3D/Tools/Shield
@onready var held_seed_node: Node3D = $HandCursor3D/Tools/HeldSeed
@onready var cursor_halo: MeshInstance3D = $HandCursor3D/Halo
@onready var trajectory_mesh_instance: MeshInstance3D = $HandCursor3D/TrajectoryMesh

# 3D Plant Parts
@onready var pot_mesh: MeshInstance3D = $PottingBench/PlantContainer/PotBody
@onready var soil_mesh: MeshInstance3D = $PottingBench/PlantContainer/SoilSurface
@onready var stem_container: Node3D = $PottingBench/PlantContainer/StemContainer
@onready var stem_mesh: MeshInstance3D = $PottingBench/PlantContainer/StemContainer/Stem
@onready var foliage_container: Node3D = $PottingBench/PlantContainer/StemContainer/Foliage
@onready var flower_bloom: Node3D = $PottingBench/PlantContainer/StemContainer/FlowerBloom
@onready var soil_mounds_container: Node3D = $PottingBench/PlantContainer/SoilMounds
@onready var planted_seeds_container: Node3D = $PottingBench/PlantContainer/PlantedSeeds

# Materials for Dynamic Biofeedback
var pot_mat: StandardMaterial3D
var soil_mat: StandardMaterial3D
var stem_mat: StandardMaterial3D
var leaf_mat: StandardMaterial3D
var halo_mat: StandardMaterial3D

const COLOR_HEALTHY_GREEN: Color = Color(0.15, 0.85, 0.35)
const COLOR_HEALTHY_LEAF: Color = Color(0.22, 0.92, 0.42)
const COLOR_STRESSED_TAN: Color = Color(0.82, 0.58, 0.32)
const COLOR_STRESSED_LEAF: Color = Color(0.72, 0.48, 0.28)

# Network & IMU
var udp_server: PacketPeerUDP
var control_mode: ControlMode = ControlMode.HYBRID_AUTO
var imu_connected: bool = false
var _toast_tween: Tween
var last_packet_time: float = 0.0
var raw_pitch: float = 0.0
var raw_roll: float = 0.0
var raw_yaw: float = 0.0
var raw_trunk_lean: float = 0.0
var calib_pitch: float = 0.0
var calib_roll: float = 0.0
var filtered_pitch: float = 0.0
var filtered_roll: float = 0.0

# 3D Kinematics Workspace
var resting_center: Vector3 = Vector3(0.0, 0.60, 0.35)
var pot_center: Vector3 = Vector3(0.0, 0.45, 0.0)
var current_pos_3d: Vector3 = Vector3(0.0, 0.60, 0.35)
var target_pos_3d: Vector3 = Vector3(0.0, 0.60, 0.35)
var previous_pos_3d: Vector3 = Vector3(0.0, 0.60, 0.35)
var previous_vel_3d: Vector3 = Vector3.ZERO
var movement_speed: float = 0.0
var current_jerk: float = 0.0

# Compensatory Posture Tracking
var is_compensating: bool = false
var debounce_timer: float = 0.0
const TRUNK_LEAN_THRESHOLD: float = 18.0 # paper: therapists found warnings too sensitive; raise if needed
const SMOOTHNESS_HEALTHY_MIN: float = 25.0 # mean/peak speed %, below = "on and off" motion

# Game Flow State
var current_level: DifficultyLevel = DifficultyLevel.LEVEL_1_EASY
var current_task_index: int = 0
var current_rep: int = 1
var is_task_active: bool = false
var task_completed: bool = false
var task_time: float = 0.0

# Task Progress
var dial_progress: float = 0.0
var holding_seed: bool = false
var holding_watering_can: bool = false
var is_pouring: bool = false
var water_poured_amount: float = 0.0
var active_targets: Array[Node3D] = []

# Plant Visual Animation
var plant_growth_scale: float = 0.0
var target_growth_scale: float = 0.0
var breeze_time: float = 0.0
var plant_healthy: bool = true

# Motion Trajectory Ribbon
var trajectory_points: Array[Vector3] = []
const MAX_TRAIL_POINTS: int = 50

# Halo Breathing Animation
var halo_pulse_time: float = 0.0

# Droplets
var active_droplets: Array[Dictionary] = []

# Clinical Telemetry per Repetition and Level
var session_records: Array[Dictionary] = []
var rep_posture_errors: int = 0
var rep_speed_samples: Array[float] = []
var rep_start_time_msec: int = 0
var rep_path_length: float = 0.0
var level_start_time_msec: int = 0


func _ready() -> void:
	_init_udp_server()
	_setup_materials()
	_connect_ui_signals()

	warning_overlay.hide()
	encouragement_banner.hide()
	summary_dialog.hide()

	show_level_intro(DifficultyLevel.LEVEL_1_EASY)


func _init_udp_server() -> void:
	udp_server = PacketPeerUDP.new()
	var err = udp_server.bind(UDP_PORT, "0.0.0.0")
	if err == OK:
		print("[UERG 3D] UDP Server listening on port %d" % UDP_PORT)
	else:
		push_warning("[UERG 3D] UDP port %d notice (Code: %d) - Hybrid fallback ready." % [UDP_PORT, err])


func _setup_materials() -> void:
	pot_mat = pot_mesh.material_override as StandardMaterial3D
	if not pot_mat:
		pot_mat = StandardMaterial3D.new()
		pot_mat.albedo_color = Color(0.82, 0.42, 0.24)
		pot_mesh.material_override = pot_mat

	soil_mat = soil_mesh.material_override as StandardMaterial3D
	if not soil_mat:
		soil_mat = StandardMaterial3D.new()
		soil_mat.albedo_color = Color(0.32, 0.22, 0.14)
		soil_mesh.material_override = soil_mat

	stem_mat = stem_mesh.material_override as StandardMaterial3D
	if not stem_mat:
		stem_mat = StandardMaterial3D.new()
		stem_mat.albedo_color = COLOR_HEALTHY_GREEN
		stem_mesh.material_override = stem_mat

	leaf_mat = StandardMaterial3D.new()
	leaf_mat.albedo_color = COLOR_HEALTHY_LEAF
	for leaf in foliage_container.get_children():
		if leaf is MeshInstance3D:
			leaf.material_override = leaf_mat

	halo_mat = cursor_halo.material_override as StandardMaterial3D
	if not halo_mat:
		halo_mat = StandardMaterial3D.new()
		halo_mat.albedo_color = Color(0.2, 0.65, 1.0, 0.85)
		halo_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		halo_mat.emission_enabled = true
		halo_mat.emission = Color(0.2, 0.65, 1.0)
		cursor_halo.material_override = halo_mat


func _connect_ui_signals() -> void:
	calibrate_button.pressed.connect(calibrate_imu)
	imu_mode_button.pressed.connect(_on_toggle_input_mode)
	start_level_button.pressed.connect(_on_start_level_button_pressed)
	continue_button.pressed.connect(_on_summary_continue_pressed)
	replay_button.pressed.connect(_on_summary_replay_pressed)
	export_button.pressed.connect(_on_export_data_pressed)


func calibrate_imu() -> void:
	calib_pitch = raw_pitch
	calib_roll = raw_roll
	filtered_pitch = 0.0
	filtered_roll = 0.0
	target_pos_3d = resting_center
	current_pos_3d = resting_center
	_show_encouragement("IMU centred. This position is now neutral.", false)


func _on_toggle_input_mode() -> void:
	control_mode = ((int(control_mode) + 1) % 4) as ControlMode
	_update_imu_status_ui()


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.is_pressed():
		if event.keycode == KEY_C:
			calibrate_imu()
		elif event.keycode == KEY_M:
			_on_toggle_input_mode()
		elif event.keycode == KEY_1:
			show_level_intro(DifficultyLevel.LEVEL_1_EASY)
		elif event.keycode == KEY_2:
			show_level_intro(DifficultyLevel.LEVEL_2_MEDIUM)
		elif event.keycode == KEY_3:
			show_level_intro(DifficultyLevel.LEVEL_3_DIFFICULT)


func show_level_intro(level: DifficultyLevel) -> void:
	current_level = level
	current_task_index = 0
	current_rep = 1
	is_task_active = false
	task_completed = false

	summary_dialog.hide()
	warning_overlay.hide()

	match current_level:
		DifficultyLevel.LEVEL_1_EASY:
			intro_title.text = "Reach and grasp"
			intro_subtitle.text = "Level 1 of 3, easy. For Brunnstrom stages III–IV"
			intro_objective.text = "Builds forward reach (shoulder flexion, elbow extension) and reach-to-grasp control while your trunk stays still."
			intro_tasks_list.text = _format_task_list([
				["Dial the soil", "Reach forward into the pot and stir in slow circles."],
				["Sow the seeds", "Reach left, pick up a seed, and carry it to the pot."],
				["Water the pot", "Reach right, lift the watering can, and pour over the plant."],
			])
			intro_posture_tip.text = "Keep your back against the chair. Reach with your arm, not your chest."
			stage_label.text = "Level 1, Brunnstrom stages III–IV"
			target_growth_scale = 0.0
			flower_bloom.visible = false

		DifficultyLevel.LEVEL_2_MEDIUM:
			intro_title.text = "Sweep across the bed"
			intro_subtitle.text = "Level 2 of 3, medium. For Brunnstrom stages IV–V"
			intro_objective.text = "Widens side-to-side reach (horizontal abduction and adduction) to move outside basic synergy patterns."
			intro_tasks_list.text = _format_task_list([
				["Weeding", "Reach left, centre, and right to pull out each weed."],
				["Clear the bugs", "Brush the pests off the leaves."],
				["Photosynthesis", "Guide the sunlight onto the plant."],
			])
			intro_posture_tip.text = "Move your shoulder smoothly. Keep it low; don't shrug or hike it."
			stage_label.text = "Level 2, Brunnstrom stages IV–V"
			target_growth_scale = 0.95
			flower_bloom.visible = false

		DifficultyLevel.LEVEL_3_DIFFICULT:
			intro_title.text = "Shelter the tree"
			intro_subtitle.text = "Level 3 of 3, difficult. For Brunnstrom stages V–VI"
			intro_objective.text = "Trains fine control, quick protective reaching, and coordination as the weather changes."
			intro_tasks_list.text = _format_task_list([
				["Block the wind", "Hold the shield in front of the young tree."],
				["Block the lightning", "Move the shield under each bolt before it lands."],
				["Catch the sunlight", "Guide full sunlight onto the tree until it blooms."],
			])
			intro_posture_tip.text = "Keep each movement fluid and your trunk steady."
			stage_label.text = "Level 3, Brunnstrom stages V–VI"
			target_growth_scale = 1.25
			flower_bloom.visible = true

	start_level_button.text = "Start level %d" % int(current_level)
	intro_dialog.modulate.a = 0.0
	intro_dialog.show()
	start_level_button.grab_focus()
	create_tween().tween_property(intro_dialog, "modulate:a", 1.0, 0.3).set_ease(Tween.EASE_OUT)


func _format_task_list(tasks: Array) -> String:
	var lines: PackedStringArray = []
	for i in tasks.size():
		lines.append("[color=#F4B740][b]%d[/b][/color]   [b]%s[/b]   [color=#A7B5A2]%s[/color]" % [i + 1, tasks[i][0], tasks[i][1]])
	return "\n".join(lines)


func _on_start_level_button_pressed() -> void:
	intro_dialog.hide()
	level_start_time_msec = Time.get_ticks_msec()
	start_task()


func start_task() -> void:
	is_task_active = true
	task_completed = false
	task_time = 0.0
	holding_seed = false
	holding_watering_can = false
	is_pouring = false
	trajectory_points.clear()
	_update_trajectory_mesh()

	_clear_dynamic_objects()

	var task_name = ""
	var task_desc = ""

	match current_level:
		DifficultyLevel.LEVEL_1_EASY:
			match current_task_index:
				0:
					task_name = "Task 1: Dial the Soil"
					task_desc = "Extend your arm forward into the pot and make circular strokes to cultivate soil."
					_set_active_tool(ToolMode.SOIL_TROWEL)
					dial_progress = 0.0
				1:
					task_name = "Task 2: Pick Up Seeds to Sow"
					task_desc = "Reach left to grasp a golden seed, carry it over the pot, and plant it."
					_set_active_tool(ToolMode.HAND_REACH)
					seed_station.visible = true
				2:
					task_name = "Task 3: Water the Potting"
					task_desc = "Reach right to pick up the watering can, bring it over the pot, and pour water."
					_set_active_tool(ToolMode.HAND_REACH)
					watering_can_station.visible = true
					water_poured_amount = 0.0

		DifficultyLevel.LEVEL_2_MEDIUM:
			match current_task_index:
				0:
					task_name = "Task 1: Weeding"
					task_desc = "Perform horizontal arm reach (abduction/adduction) to pull out weeds across the bed."
					_set_active_tool(ToolMode.HAND_REACH)
					_spawn_3d_weeds()
				1:
					task_name = "Task 2: Deinsectization"
					task_desc = "Reach forward across plant leaves to gently brush away harmful garden bugs."
					_set_active_tool(ToolMode.HAND_REACH)
					_spawn_3d_bugs()
				2:
					task_name = "Task 3: Photosynthesis"
					task_desc = "Guide the reflective sunlight beams to energize foliage."
					_set_active_tool(ToolMode.PROTECTIVE_SHIELD)
					_spawn_3d_sunlight()

		DifficultyLevel.LEVEL_3_DIFFICULT:
			match current_task_index:
				0:
					task_name = "Task 1: Block Wind for Tree"
					task_desc = "Coordinated spatial reach: position shield against incoming wind gusts."
					_set_active_tool(ToolMode.PROTECTIVE_SHIELD)
					_spawn_3d_wind()
				1:
					task_name = "Task 2: Block Lightning"
					task_desc = "Rapid reaction reaching: position protective shield under lightning bolts."
					_set_active_tool(ToolMode.PROTECTIVE_SHIELD)
					_spawn_3d_lightning()
				2:
					task_name = "Task 3: Receive Sunlight"
					task_desc = "Orient canopy to receive full sunlight for final blossom!"
					_set_active_tool(ToolMode.PROTECTIVE_SHIELD)
					_spawn_3d_sunlight()

	task_name_label.text = task_name
	task_desc_label.text = task_desc
	reps_label.text = "%d of %d" % [current_rep, REQUIRED_REPS]

	rep_start_time_msec = Time.get_ticks_msec()
	rep_posture_errors = 0
	rep_speed_samples.clear()
	rep_path_length = 0.0


func _set_active_tool(tool: ToolMode) -> void:
	trowel_node.visible = (tool == ToolMode.SOIL_TROWEL)
	hand_node.visible = (tool == ToolMode.HAND_REACH)
	watering_can_node.visible = (tool == ToolMode.WATERING_CAN)
	shield_node.visible = (tool == ToolMode.PROTECTIVE_SHIELD)
	if held_seed_node:
		held_seed_node.visible = false


func _process(delta: float) -> void:
	breeze_time += delta
	halo_pulse_time += delta
	_process_udp_packets()
	_update_imu_status_ui()
	_update_cursor_movement(delta)
	_update_plant_animation(delta)
	_update_droplets(delta)
	_update_halo_pulse(delta)
	scrim.visible = intro_dialog.visible or summary_dialog.visible

	if not is_task_active or task_completed:
		return

	if is_compensating:
		_set_halo_warning(true)
		return
	else:
		_set_halo_warning(false)

	task_time += delta
	timer_label.text = "%.1f s" % task_time

	rep_speed_samples.append(movement_speed * 100.0)
	var smoothness = 100.0 - clampf(current_jerk * 3.0, 0.0, 60.0)
	smoothness_label.text = "%d%%" % int(smoothness)
	posture_errors_label.text = str(rep_posture_errors)

	match current_level:
		DifficultyLevel.LEVEL_1_EASY:
			_process_easy_level_3d(delta)
		DifficultyLevel.LEVEL_2_MEDIUM, DifficultyLevel.LEVEL_3_DIFFICULT:
			_process_multitarget_level_3d(delta)


func _process_udp_packets() -> void:
	if not udp_server:
		return

	while udp_server.get_available_packet_count() > 0:
		var packet = udp_server.get_packet()
		var text = packet.get_string_from_utf8().strip_edges()
		if text.is_empty():
			continue

		last_packet_time = Time.get_ticks_msec() / 1000.0
		_parse_packet(text)

	var time_now = Time.get_ticks_msec() / 1000.0
	imu_connected = (time_now - last_packet_time) < 1.5


func _parse_packet(text: String) -> void:
	if text.begins_with("{") and text.ends_with("}"):
		var json = JSON.new()
		if json.parse(text) == OK and json.data is Dictionary:
			var d: Dictionary = json.data
			raw_pitch = float(d.get("pitch", raw_pitch))
			raw_roll = float(d.get("roll", raw_roll))
			raw_yaw = float(d.get("yaw", raw_yaw))
			raw_trunk_lean = float(d.get("trunk_lean", 0.0))
			return

	var parts = text.split(",")
	if parts.size() >= 2:
		raw_pitch = float(parts[0])
		raw_roll = float(parts[1])
		if parts.size() >= 3:
			raw_yaw = float(parts[2])
		if parts.size() >= 4:
			raw_trunk_lean = float(parts[3])


func _update_cursor_movement(delta: float) -> void:
	var active_input = control_mode
	if control_mode == ControlMode.HYBRID_AUTO:
		active_input = ControlMode.IMU_ONLY if imu_connected else ControlMode.MOUSE_ONLY

	match active_input:
		ControlMode.IMU_ONLY:
			var rel_p = raw_pitch - calib_pitch
			var rel_r = raw_roll - calib_roll
			filtered_pitch = lerpf(filtered_pitch, rel_p, 0.3)
			filtered_roll = lerpf(filtered_roll, rel_r, 0.3)

			var x = filtered_roll * 0.016
			var z = -filtered_pitch * 0.018
			var y = absf(filtered_pitch) * 0.003
			target_pos_3d = resting_center + Vector3(x, y, z)

		ControlMode.MOUSE_ONLY:
			var vp = get_viewport()
			if vp:
				var m = vp.get_mouse_position()
				var s = vp.get_visible_rect().size
				var nx = (m.x / s.x) * 2.0 - 1.0
				var ny = (m.y / s.y) * 2.0 - 1.0
				target_pos_3d = Vector3(nx * 0.55, 0.58 - ny * 0.05, ny * 0.35 + 0.10)

		ControlMode.KEYBOARD_ONLY:
			var dir = Vector3.ZERO
			if Input.is_action_pressed("ui_right") or Input.is_key_pressed(KEY_D):
				dir.x += 1.0
			if Input.is_action_pressed("ui_left") or Input.is_key_pressed(KEY_A):
				dir.x -= 1.0
			if Input.is_action_pressed("ui_up") or Input.is_key_pressed(KEY_W):
				dir.z -= 1.0
			if Input.is_action_pressed("ui_down") or Input.is_key_pressed(KEY_S):
				dir.z += 1.0
			if Input.is_key_pressed(KEY_E):
				dir.y += 1.0
			if Input.is_key_pressed(KEY_Q):
				dir.y -= 1.0
			if dir.length_squared() > 0:
				target_pos_3d += dir.normalized() * 0.8 * delta

	target_pos_3d.x = clampf(target_pos_3d.x, -0.65, 0.65)
	target_pos_3d.y = clampf(target_pos_3d.y, 0.48, 0.95)
	target_pos_3d.z = clampf(target_pos_3d.z, -0.35, 0.55)

	current_pos_3d = current_pos_3d.lerp(target_pos_3d, clampf(14.0 * delta, 0.05, 1.0))
	hand_cursor.position = current_pos_3d

	# Tilt the cursor in movement direction for a living feel
	var move_dir = target_pos_3d - current_pos_3d
	var tilt_x = clampf(move_dir.z * 4.0, -0.35, 0.35)
	var tilt_z = clampf(-move_dir.x * 4.0, -0.35, 0.35)
	hand_cursor.rotation = hand_cursor.rotation.lerp(Vector3(tilt_x, 0, tilt_z), clampf(8.0 * delta, 0.05, 1.0))

	var disp = current_pos_3d - previous_pos_3d
	rep_path_length += disp.length()
	var vel = disp / delta
	movement_speed = vel.length()
	var accel = (vel - previous_vel_3d) / delta
	current_jerk = accel.length()

	previous_pos_3d = current_pos_3d
	previous_vel_3d = vel

	if trajectory_points.is_empty() or current_pos_3d.distance_squared_to(trajectory_points.back()) > 0.0009:
		trajectory_points.append(current_pos_3d)
		if trajectory_points.size() > MAX_TRAIL_POINTS:
			trajectory_points.pop_front()
		_update_trajectory_mesh()

	var torso_lean = absf(raw_trunk_lean) > TRUNK_LEAN_THRESHOLD or Input.is_key_pressed(KEY_T)
	if torso_lean:
		debounce_timer += delta
		if debounce_timer >= 0.25 and not is_compensating:
			is_compensating = true
			rep_posture_errors += 1
			plant_healthy = false
			warning_reason_label.text = "Your trunk is leaning forward. Rest your back against the chair and the exercise resumes on its own."
			warning_overlay.show()
	else:
		if debounce_timer > 0.0:
			debounce_timer -= delta * 2.0
		if is_compensating and debounce_timer <= 0.0:
			is_compensating = false
			warning_overlay.hide()
			_show_encouragement("Good posture. Carry on.", false)


func _update_trajectory_mesh() -> void:
	if not (trajectory_mesh_instance.mesh is ImmediateMesh):
		return
	var imm: ImmediateMesh = trajectory_mesh_instance.mesh as ImmediateMesh
	imm.clear_surfaces()
	if trajectory_points.size() < 2:
		return
	imm.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for i in range(trajectory_points.size()):
		var t = float(i) / float(trajectory_points.size())
		var alpha = t * 0.85
		var col: Color
		if is_compensating:
			col = Color(1.0, 0.2 + t * 0.15, 0.1, alpha)
		else:
			# Rainbow gradient: cyan -> blue -> violet as trail ages
			var hue = 0.52 + t * 0.18
			col = Color.from_hsv(hue, 0.7, 0.95, alpha)
		imm.surface_set_color(col)
		imm.surface_add_vertex(trajectory_points[i])
	imm.surface_end()


func _set_halo_warning(warn: bool) -> void:
	if not halo_mat:
		return
	if warn:
		halo_mat.albedo_color = Color(1.0, 0.2, 0.15, 0.95)
		halo_mat.emission = Color(1.0, 0.2, 0.15)
		halo_mat.emission_energy_multiplier = 2.5
	elif holding_seed or holding_watering_can:
		halo_mat.albedo_color = Color(0.15, 0.95, 0.45, 0.92)
		halo_mat.emission = Color(0.15, 0.95, 0.45)
		halo_mat.emission_energy_multiplier = 2.0
	else:
		halo_mat.albedo_color = Color(0.3, 0.85, 1.0, 0.9)
		halo_mat.emission = Color(0.3, 0.85, 1.0)
		halo_mat.emission_energy_multiplier = 1.8


func _update_halo_pulse(_delta: float) -> void:
	if not halo_mat:
		return
	# Breathing pulse on the halo emission intensity
	var pulse = 1.0 + sin(halo_pulse_time * 3.5) * 0.35
	var base_energy = 1.8
	if is_compensating:
		base_energy = 2.5
		pulse = 1.0 + sin(halo_pulse_time * 8.0) * 0.5  # Fast alarming pulse
	elif holding_seed or holding_watering_can:
		base_energy = 2.0
	halo_mat.emission_energy_multiplier = base_energy * pulse
	# Subtle scale breathing on cursor halo
	var s = 1.0 + sin(halo_pulse_time * 2.8) * 0.05
	cursor_halo.scale = Vector3(s, s, s)


func _update_plant_animation(delta: float) -> void:
	plant_growth_scale = lerpf(plant_growth_scale, target_growth_scale, delta * 3.0)
	stem_container.scale = Vector3.ONE * plant_growth_scale

	var target_stem = COLOR_HEALTHY_GREEN if plant_healthy else COLOR_STRESSED_TAN
	var target_leaf = COLOR_HEALTHY_LEAF if plant_healthy else COLOR_STRESSED_LEAF
	stem_mat.albedo_color = stem_mat.albedo_color.lerp(target_stem, delta * 4.0)
	leaf_mat.albedo_color = leaf_mat.albedo_color.lerp(target_leaf, delta * 4.0)

	if plant_growth_scale > 0.05:
		var sway_z = sin(breeze_time * 2.2) * 0.035 * plant_growth_scale
		var sway_x = cos(breeze_time * 1.8) * 0.025 * plant_growth_scale
		stem_container.rotation = Vector3(sway_z, 0, sway_x)


func _process_easy_level_3d(delta: float) -> void:
	match current_task_index:
		0: # Dial Soil in 3D
			var dist = hand_cursor.position.distance_to(pot_center)
			if dist < 0.28 and movement_speed > 0.08:
				dial_progress += delta * 0.45
				var active_count = int(dial_progress * soil_mounds_container.get_child_count())
				for i in range(soil_mounds_container.get_child_count()):
					soil_mounds_container.get_child(i).visible = (i <= active_count)
				if dial_progress >= 1.0:
					_complete_current_repetition()

		1: # Pick seeds to sow in 3D
			var seed_pos = seed_station.global_position
			if not holding_seed:
				if hand_cursor.global_position.distance_to(seed_pos) < 0.18:
					holding_seed = true
					seed_station.visible = false
					held_seed_node.visible = true
					_show_encouragement("Seed in hand. Carry it to the pot.")
			else:
				if hand_cursor.global_position.distance_to(pot_center) < 0.24:
					holding_seed = false
					held_seed_node.visible = false
					for s in planted_seeds_container.get_children():
						if not s.visible:
							s.visible = true
							break
					_show_encouragement("Seed planted.")
					_complete_current_repetition()

		2: # Water the potting in 3D
			var can_pos = watering_can_station.global_position
			if not holding_watering_can:
				if hand_cursor.global_position.distance_to(can_pos) < 0.20:
					holding_watering_can = true
					watering_can_station.visible = false
					_set_active_tool(ToolMode.WATERING_CAN)
					_show_encouragement("Can lifted. Hold it over the pot to pour.")
			else:
				var dist = hand_cursor.global_position.distance_to(pot_center + Vector3(0.08, 0.15, 0))
				if dist < 0.26:
					is_pouring = true
					watering_can_node.rotation_degrees = Vector3(-35, 0, 0)
					water_poured_amount += delta * 0.50
					soil_mat.albedo_color = Color(0.32, 0.22, 0.14).lerp(Color(0.18, 0.11, 0.06), water_poured_amount)
					if randf() < 0.40:
						_spawn_water_droplet()
					if water_poured_amount >= 1.0:
						is_pouring = false
						watering_can_node.rotation_degrees = Vector3.ZERO
						target_growth_scale = 0.55
						_complete_current_repetition()
				else:
					is_pouring = false
					watering_can_node.rotation_degrees = Vector3.ZERO


func _spawn_water_droplet() -> void:
	var d = MeshInstance3D.new()
	var sp = SphereMesh.new()
	var size = randf_range(0.008, 0.018)
	sp.radius = size
	sp.height = size * 1.4
	d.mesh = sp
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.3, 0.75, 1.0, 0.8)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true
	mat.emission = Color(0.2, 0.6, 1.0)
	mat.emission_energy_multiplier = 0.5
	d.material_override = mat
	d.position = hand_cursor.global_position + Vector3(randf_range(-0.08, 0.02), 0.08, randf_range(-0.08, 0.02))
	d.top_level = true
	dynamic_3d_container.add_child(d)
	active_droplets.append({"node": d, "vel": Vector3(randf_range(-0.06, 0.06), randf_range(-0.6, -0.85), randf_range(-0.06, 0.06)), "life": randf_range(0.35, 0.6)})


func _update_droplets(delta: float) -> void:
	for i in range(active_droplets.size() - 1, -1, -1):
		var drop = active_droplets[i]
		drop["life"] -= delta
		var node: MeshInstance3D = drop["node"]
		node.position += drop["vel"] * delta
		if drop["life"] <= 0.0:
			node.queue_free()
			active_droplets.remove_at(i)


func _process_multitarget_level_3d(_delta: float) -> void:
	# IMU tilt / mouse only drive 2 DOF (lateral + forward), so hit-test on the table plane.
	var hand_xz = Vector2(hand_cursor.global_position.x, hand_cursor.global_position.z)
	for i in range(active_targets.size() - 1, -1, -1):
		var target = active_targets[i]
		if hand_xz.distance_to(Vector2(target.global_position.x, target.global_position.z)) < 0.16:
			active_targets.remove_at(i)
			target.queue_free()
			_show_encouragement("Reached. Good arm extension.")
	if active_targets.is_empty():
		_complete_current_repetition()


func _complete_current_repetition() -> void:
	task_completed = true
	is_task_active = false

	var duration = (Time.get_ticks_msec() - rep_start_time_msec) / 1000.0
	var mean_spd = 0.0
	var peak_spd = 0.0
	if not rep_speed_samples.is_empty():
		var total_s = 0.0
		for s in rep_speed_samples:
			total_s += s
			if s > peak_spd:
				peak_spd = s
		mean_spd = total_s / float(rep_speed_samples.size())
	var smoothness = clampf(mean_spd / maxf(1.0, peak_spd), 0.0, 1.0) * 100.0

	# Paper: seedling turns tan on compensatory posture OR "on and off" (jerky) operation.
	var rep_healthy = rep_posture_errors == 0 and smoothness >= SMOOTHNESS_HEALTHY_MIN
	plant_healthy = rep_healthy

	var record = {
		"level": int(current_level),
		"repetition": current_rep,
		"task": task_name_label.text,
		"duration_sec": duration,
		"path_length": rep_path_length,
		"mean_speed": mean_spd,
		"peak_speed": peak_spd,
		"smoothness_pct": smoothness,
		"posture_errors": rep_posture_errors,
		"plant_health": "Healthy (Fresh Green)" if rep_healthy else "Compensated (Tan)"
	}
	session_records.append(record)

	_show_encouragement("Repetition done. Well done.", true)

	await get_tree().create_timer(1.2).timeout

	if current_rep < REQUIRED_REPS:
		current_rep += 1
		start_task()
	else:
		if current_task_index < 2:
			current_task_index += 1
			current_rep = 1
			_show_encouragement("Task complete. Next one coming up.", true)
			await get_tree().create_timer(1.0).timeout
			start_task()
		else:
			_show_level_summary()


func _show_level_summary() -> void:
	var total_time = 0.0
	var total_errors = 0
	var total_path = 0.0
	var count = 0
	var avg_smoothness = 0.0
	var task_breakdown_str = ""

	for r in session_records:
		if r["level"] == int(current_level):
			count += 1
			total_time += r["duration_sec"]
			total_errors += r["posture_errors"]
			total_path += r["path_length"]
			avg_smoothness += r["smoothness_pct"]
			task_breakdown_str += "[cell]%s[/cell][cell]%d[/cell][cell]%.1f s[/cell][cell]%.2f m[/cell][cell]%d[/cell]" % [
				r["task"], r["repetition"], r["duration_sec"], r["path_length"], r["posture_errors"]
			]

	if count > 0:
		avg_smoothness /= float(count)

	var plant_status = "Healthy green" if total_errors <= 1 else "Stressed tan"
	var level_name = "Easy" if current_level == DifficultyLevel.LEVEL_1_EASY else ("Medium" if current_level == DifficultyLevel.LEVEL_2_MEDIUM else "Difficult")

	summary_title.text = "Level %d report, %s" % [int(current_level), level_name.to_lower()]

	summary_stats_label.text = "[table=3]" + \
		_metric_cell("%.1f s" % total_time, "Total time, %.1f s per rep" % (total_time / maxf(1.0, float(count)))) + \
		_metric_cell("%d of %d" % [count, REQUIRED_REPS * 3], "Repetitions") + \
		_metric_cell("%.0f%%" % avg_smoothness, "Smoothness") + \
		_metric_cell("%.2f m" % total_path, "Hand path length") + \
		_metric_cell(str(total_errors), "Posture alerts") + \
		_metric_cell(plant_status, "Plant feedback") + \
		"[/table]"

	var head = "[color=#A7B5A2]"
	summary_tasks_breakdown.text = "[table=5][cell]%sTask[/color][/cell][cell]%sRep[/color][/cell][cell]%sTime[/color][/cell][cell]%sPath[/color][/cell][cell]%sAlerts[/color][/cell]" % [head, head, head, head, head] + \
		task_breakdown_str + "[/table]"

	if total_errors == 0:
		summary_assessment_label.text = "Steady trunk throughout. Elbow extension and shoulder flexion were performed without forward leaning."
	elif total_errors <= 2:
		summary_assessment_label.text = "Good effort with minor trunk substitution. Smoothness and reach path stayed steady."
	else:
		summary_assessment_label.text = "Frequent forward trunk lean. Suggest checking backrest support so reaching comes from the arm."

	continue_button.text = "Back to level 1" if current_level == DifficultyLevel.LEVEL_3_DIFFICULT else "Next level"
	summary_dialog.modulate.a = 0.0
	summary_dialog.show()
	continue_button.grab_focus()
	create_tween().tween_property(summary_dialog, "modulate:a", 1.0, 0.3).set_ease(Tween.EASE_OUT)


func _metric_cell(value: String, caption: String) -> String:
	return "[cell][font_size=24][b]%s[/b][/font_size]\n[color=#A7B5A2][font_size=13]%s[/font_size][/color][/cell]" % [value, caption]


func _on_summary_continue_pressed() -> void:
	summary_dialog.hide()
	if current_level == DifficultyLevel.LEVEL_1_EASY:
		show_level_intro(DifficultyLevel.LEVEL_2_MEDIUM)
	elif current_level == DifficultyLevel.LEVEL_2_MEDIUM:
		show_level_intro(DifficultyLevel.LEVEL_3_DIFFICULT)
	else:
		show_level_intro(DifficultyLevel.LEVEL_1_EASY)


func _on_summary_replay_pressed() -> void:
	summary_dialog.hide()
	show_level_intro(current_level)


func _on_export_data_pressed() -> void:
	var path = "user://stroke_rehab_session_%d.json" % int(Time.get_unix_time_from_system())
	var file = FileAccess.open(path, FileAccess.WRITE)
	if file:
		var export_data = {
			"timestamp": Time.get_datetime_string_from_system(),
			"level": int(current_level),
			"records": session_records
		}
		file.store_string(JSON.stringify(export_data, "\t"))
		file.close()
		_show_encouragement("Session data saved to " + ProjectSettings.globalize_path(path))


func _update_imu_status_ui() -> void:
	var mode_name = ""
	match control_mode:
		ControlMode.HYBRID_AUTO:
			mode_name = "Auto"
		ControlMode.IMU_ONLY:
			mode_name = "IMU"
		ControlMode.MOUSE_ONLY:
			mode_name = "Mouse"
		ControlMode.KEYBOARD_ONLY:
			mode_name = "Keyboard"

	imu_mode_button.text = "Input: %s" % mode_name
	var status = ("● IMU connected, port %d" if imu_connected else "○ Waiting for IMU on port %d") % UDP_PORT
	if imu_status_label.text != status:
		imu_status_label.text = status
		imu_status_label.add_theme_color_override("font_color", Color("9AD48C") if imu_connected else Color("A7B5A2"))


func _show_encouragement(text: String, _celebration: bool = false) -> void:
	if _toast_tween:
		_toast_tween.kill()
	encouragement_label.text = text
	encouragement_banner.size = Vector2.ZERO  # shrink to fit the new text
	var view = get_viewport().get_visible_rect().size
	var toast_y = view.y - 150.0  # bottom centre, above the IMU / hotkey row
	encouragement_banner.position = Vector2((view.x - encouragement_banner.size.x) / 2.0, toast_y + 10.0)
	encouragement_banner.modulate.a = 0.0
	encouragement_banner.show()
	_toast_tween = create_tween().set_parallel(true)
	_toast_tween.tween_property(encouragement_banner, "modulate:a", 1.0, 0.2).set_ease(Tween.EASE_OUT)
	_toast_tween.tween_property(encouragement_banner, "position:y", toast_y, 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_toast_tween.chain().tween_interval(1.6)
	_toast_tween.chain().tween_property(encouragement_banner, "modulate:a", 0.0, 0.4)
	_toast_tween.chain().tween_callback(encouragement_banner.hide)


func _clear_dynamic_objects() -> void:
	seed_station.visible = false
	watering_can_station.visible = false
	for child in dynamic_3d_container.get_children():
		child.queue_free()
	active_targets.clear()


func _spawn_3d_weeds() -> void:
	# Spread wide apart, avoid center (X=0), all positive Z for camera visibility
	var offsets = [Vector3(-0.45, 0.10, 0.25), Vector3(0.15, 0.10, 0.35), Vector3(0.50, 0.10, 0.20)]
	var weed_colors = [Color(0.3, 0.7, 0.15), Color(0.25, 0.6, 0.12), Color(0.35, 0.65, 0.2)]
	for idx in range(offsets.size()):
		var weed = MeshInstance3D.new()
		var prism = PrismMesh.new()
		prism.size = Vector3(0.06, 0.16, 0.035)
		weed.mesh = prism
		var mat = StandardMaterial3D.new()
		mat.albedo_color = weed_colors[idx]
		mat.emission_enabled = true
		mat.emission = weed_colors[idx] * 0.3
		mat.emission_energy_multiplier = 0.4
		weed.material_override = mat
		weed.position = pot_center + offsets[idx]
		dynamic_3d_container.add_child(weed)
		active_targets.append(weed)


func _spawn_3d_bugs() -> void:
	# Spread wide apart, avoid center, all positive Z
	var offsets = [Vector3(-0.40, 0.22, 0.20), Vector3(0.15, 0.30, 0.30), Vector3(0.45, 0.24, 0.15)]
	for off in offsets:
		var bug = MeshInstance3D.new()
		var sphere = SphereMesh.new()
		sphere.radius = 0.028
		sphere.height = 0.038
		bug.mesh = sphere
		var mat = StandardMaterial3D.new()
		mat.albedo_color = Color(0.95, 0.15, 0.1)
		mat.emission_enabled = true
		mat.emission = Color(0.9, 0.1, 0.05)
		mat.emission_energy_multiplier = 0.6
		bug.material_override = mat
		bug.position = pot_center + off
		dynamic_3d_container.add_child(bug)
		active_targets.append(bug)


func _spawn_3d_sunlight() -> void:
	# Spread wide apart, avoid center, all positive Z
	var positions = [Vector3(-0.50, 0.75, 0.20), Vector3(0.15, 0.85, 0.25), Vector3(0.55, 0.75, 0.20)]
	for pos in positions:
		var sun = MeshInstance3D.new()
		var sphere = SphereMesh.new()
		sphere.radius = 0.05
		sphere.height = 0.065
		sun.mesh = sphere
		var mat = StandardMaterial3D.new()
		mat.albedo_color = Color(1.0, 0.9, 0.3)
		mat.emission_enabled = true
		mat.emission = Color(1.0, 0.85, 0.2)
		mat.emission_energy_multiplier = 1.5
		sun.material_override = mat
		sun.position = pos
		dynamic_3d_container.add_child(sun)
		active_targets.append(sun)


func _spawn_3d_wind() -> void:
	# Spread wide apart, avoid center, all positive Z
	var positions = [Vector3(-0.50, 0.65, 0.20), Vector3(0.15, 0.72, 0.30), Vector3(0.55, 0.65, 0.20)]
	for pos in positions:
		var gust = MeshInstance3D.new()
		var cyl = CylinderMesh.new()
		cyl.top_radius = 0.035
		cyl.bottom_radius = 0.035
		cyl.height = 0.2
		gust.mesh = cyl
		var mat = StandardMaterial3D.new()
		mat.albedo_color = Color(0.65, 0.88, 1.0, 0.6)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.emission_enabled = true
		mat.emission = Color(0.5, 0.8, 1.0)
		mat.emission_energy_multiplier = 0.5
		gust.material_override = mat
		gust.position = pos
		gust.rotation_degrees = Vector3(0, 0, 90)
		dynamic_3d_container.add_child(gust)
		active_targets.append(gust)


func _spawn_3d_lightning() -> void:
	# Spread wide apart, avoid center, all positive Z
	var positions = [Vector3(-0.45, 0.78, 0.18), Vector3(0.45, 0.78, 0.18)]
	for pos in positions:
		var bolt = MeshInstance3D.new()
		var prism = PrismMesh.new()
		prism.size = Vector3(0.055, 0.2, 0.025)
		bolt.mesh = prism
		var mat = StandardMaterial3D.new()
		mat.albedo_color = Color(1.0, 0.95, 0.2)
		mat.emission_enabled = true
		mat.emission = Color(1.0, 0.9, 0.15)
		mat.emission_energy_multiplier = 2.0
		bolt.material_override = mat
		bolt.position = pos
		dynamic_3d_container.add_child(bolt)
		active_targets.append(bolt)
