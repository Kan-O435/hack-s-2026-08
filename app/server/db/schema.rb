# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_08_28_100000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "room_participants", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "joined_at", null: false
    t.datetime "left_at"
    t.bigint "room_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["room_id", "user_id"], name: "index_room_participants_on_room_id_and_user_id", unique: true
    t.index ["room_id"], name: "index_room_participants_on_room_id"
    t.index ["user_id"], name: "index_room_participants_on_user_id"
  end

  create_table "room_results", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "critique"
    t.bigint "room_id", null: false
    t.integer "total_score", default: 0, null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.string "voice_roast_status", default: "unavailable", null: false
    t.index ["room_id", "user_id"], name: "index_room_results_on_room_id_and_user_id", unique: true
    t.index ["room_id"], name: "index_room_results_on_room_id"
    t.index ["user_id"], name: "index_room_results_on_user_id"
  end

  create_table "rooms", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "finished_at"
    t.boolean "has_alcohol", default: false, null: false
    t.bigint "host_user_id", null: false
    t.string "name", null: false
    t.string "passcode", null: false
    t.datetime "started_at"
    t.integer "status", default: 0, null: false
    t.text "summary_text"
    t.bigint "top_user_id"
    t.datetime "updated_at", null: false
    t.index ["host_user_id"], name: "index_rooms_on_host_user_id"
    t.index ["passcode"], name: "index_rooms_on_passcode", unique: true
    t.index ["top_user_id"], name: "index_rooms_on_top_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "device_token", null: false
    t.string "nickname", null: false
    t.datetime "updated_at", null: false
    t.index ["device_token"], name: "index_users_on_device_token", unique: true
  end

  create_table "utterances", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "cringe_phrase"
    t.text "cringe_reason"
    t.integer "cringe_score"
    t.integer "duration_ms", null: false
    t.integer "pause_before_ms"
    t.integer "realtime_score"
    t.bigint "room_id", null: false
    t.datetime "snapshot_captured_at"
    t.boolean "sneer_detected", default: false, null: false
    t.float "speech_rate"
    t.datetime "spoken_at", null: false
    t.text "transcript", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.float "volume_drop_ratio"
    t.index ["room_id"], name: "index_utterances_on_room_id"
    t.index ["user_id"], name: "index_utterances_on_user_id"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "room_participants", "rooms"
  add_foreign_key "room_participants", "users"
  add_foreign_key "room_results", "rooms"
  add_foreign_key "room_results", "users"
  add_foreign_key "rooms", "users", column: "host_user_id"
  add_foreign_key "rooms", "users", column: "top_user_id"
  add_foreign_key "utterances", "rooms"
  add_foreign_key "utterances", "users"
end
