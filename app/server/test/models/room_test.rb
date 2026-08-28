require "test_helper"
require "stringio"

class RoomTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  test "purge_expired! deletes finished rooms past the retention period that fall outside the keep count" do
    fill_recent_rooms(Room::RETENTION_KEEP_COUNT)
    expired_room = create_finished_room(finished_at: (Room::RETENTION_PERIOD + 1.day).ago)

    purged = perform_enqueued_jobs { Room.purge_expired! }

    assert_equal 1, purged
    assert_not Room.exists?(expired_room.id)
  end

  test "purge_expired! keeps rooms that are within the retention period even if outside the keep count" do
    fill_recent_rooms(Room::RETENTION_KEEP_COUNT)
    recent_room = create_finished_room(finished_at: (Room::RETENTION_PERIOD - 1.day).ago)

    Room.purge_expired!

    assert Room.exists?(recent_room.id)
  end

  test "purge_expired! keeps rooms older than the retention period if they are within the keep count" do
    old_but_kept_room = create_finished_room(finished_at: (Room::RETENTION_PERIOD + 10.days).ago)

    purged = Room.purge_expired!

    assert_equal 0, purged
    assert Room.exists?(old_but_kept_room.id)
  end

  test "purge_expired! purges the sneer photo and voice roast audio of deleted rooms" do
    fill_recent_rooms(Room::RETENTION_KEEP_COUNT)
    expired_room = create_finished_room(finished_at: (Room::RETENTION_PERIOD + 1.day).ago)
    utterance = expired_room.utterances.first
    utterance.sneer_photo.attach(
      io: StringIO.new("jpeg"), filename: "sneer.jpg", content_type: "image/jpeg", identify: false
    )
    result = RoomResult.find_by(room: expired_room)
    result.voice_roast_audio.attach(
      io: StringIO.new("mp3"), filename: "roast.mp3", content_type: "audio/mpeg", identify: false
    )
    photo_blob = utterance.sneer_photo.blob
    audio_blob = result.voice_roast_audio.blob

    perform_enqueued_jobs { Room.purge_expired! }

    assert_not ActiveStorage::Blob.exists?(photo_blob.id)
    assert_not ActiveStorage::Blob.exists?(audio_blob.id)
  end

  private

  # 直近件数の枠を埋めるためだけの、十分新しい(削除対象にならない)ルーム群
  def fill_recent_rooms(count)
    count.times { create_finished_room(finished_at: 1.hour.ago) }
  end

  def create_finished_room(finished_at:)
    user = User.create!(nickname: "user-#{SecureRandom.hex(4)}")
    room = Room.create!(name: "room-#{SecureRandom.hex(4)}", host_user: user, status: :finished, finished_at: finished_at)
    room.room_participants.create!(user: user, joined_at: Time.current)
    room.utterances.create!(
      user: user, transcript: "テスト", spoken_at: Time.current, duration_ms: 500, cringe_score: 10
    )
    RoomResult.create!(room: room, user: user, total_score: 10, critique: "test")
    room
  end
end
