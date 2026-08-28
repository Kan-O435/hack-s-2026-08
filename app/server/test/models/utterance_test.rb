require "test_helper"
require "stringio"

class UtteranceTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    user = User.create!(nickname: "テストユーザー")
    room = Room.create!(name: "テストルーム", host_user: user)
    @utterance = Utterance.new(
      room: room,
      user: user,
      transcript: "テスト発話",
      spoken_at: Time.current,
      duration_ms: 1_000
    )
  end

  test "accepts a JPEG sneer photo" do
    attach_photo(content: "jpeg", filename: "sneer.jpg", content_type: "image/jpeg")

    assert @utterance.valid?
  end

  test "rejects an unsupported sneer photo format" do
    attach_photo(content: "png", filename: "sneer.png", content_type: "image/png")

    assert_not @utterance.valid?
    assert_includes @utterance.errors[:sneer_photo], "はJPEGまたはWebP形式にしてください"
  end

  test "rejects a sneer photo larger than five megabytes" do
    attach_photo(
      content: "x" * (Utterance::SNEER_PHOTO_MAX_SIZE + 1),
      filename: "large.jpg",
      content_type: "image/jpeg"
    )

    assert_not @utterance.valid?
    assert_includes @utterance.errors[:sneer_photo], "は5MB以下にしてください"
  end

  test "purges the sneer photo when the utterance is destroyed" do
    attach_photo(content: "jpeg", filename: "sneer.jpg", content_type: "image/jpeg")
    @utterance.save!
    blob = @utterance.sneer_photo.blob

    perform_enqueued_jobs { @utterance.destroy! }

    assert_not ActiveStorage::Blob.exists?(blob.id)
  end

  private

  def attach_photo(content:, filename:, content_type:)
    @utterance.sneer_photo.attach(
      io: StringIO.new(content),
      filename: filename,
      content_type: content_type,
      identify: false
    )
  end
end
