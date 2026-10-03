
extends Node2D

@export var speed: float = 250.0

var movement_enabled: bool = true


func _process(delta: float) -> void:

	if not movement_enabled:
		return

	if Input.is_action_pressed("ui_right"):
		position.x += speed * delta

	if Input.is_action_pressed("ui_left"):
		position.x -= speed * delta

	# Prevent movement outside the game area.
	position.x = clampf(position.x, 150.0, 850.0)
