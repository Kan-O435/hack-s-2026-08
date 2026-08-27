require "test_helper"
require "base64"
require "stringio"

class Api::V1::SneerPhotosControllerTest < ActionDispatch::IntegrationTest
  WEBP_DATA = Base64.strict_decode64("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==")

  setup do
    @user = User.create!(nickname: "撮影者")
    @other_user = User.create!(nickname: "別の参加者")
    @room = Room.create!(name: "テストルーム", host_user: @user)
    @room.room_participants.create!(user: @user, joined_at: Time.current)
    @room.room_participants.create!(user: @other_user, joined_at: Time.current)
    @utterance = create_utterance(user: @user, sneer_detected: true)
  end

  test "uploads a photo to the current user's sneer utterance" do
    captured_at = Time.current.change(usec: 0)

    put "/api/v1/utterances/#{@utterance.id}/sneer_photo",
      params: { photo: uploaded_photo, captured_at: captured_at.iso8601 },
      headers: auth_headers(@user)

    assert_response :created
    @utterance.reload
    assert @utterance.sneer_photo.attached?
    assert_equal captured_at, @utterance.snapshot_captured_at
    assert response.parsed_body.dig("utterance", "photo_url").present?
  end

  test "returns the existing photo without replacing it on retry" do
    first_captured_at = 1.minute.ago.change(usec: 0)
    put_photo(@utterance, @user, first_captured_at)
    original_blob_id = @utterance.reload.sneer_photo.blob_id

    put_photo(@utterance, @user, Time.current.change(usec: 0))

    assert_response :ok
    @utterance.reload
    assert_equal original_blob_id, @utterance.sneer_photo.blob_id
    assert_equal first_captured_at, @utterance.snapshot_captured_at
  end

  test "rejects an upload to another user's utterance" do
    put_photo(@utterance, @other_user, Time.current)

    assert_response :forbidden
    assert_not @utterance.reload.sneer_photo.attached?
  end

  test "rejects an upload when the utterance is not a sneer" do
    utterance = create_utterance(user: @user, sneer_detected: false)

    put_photo(utterance, @user, Time.current)

    assert_response :unprocessable_entity
    assert_equal "not_sneer", response.parsed_body.dig("error", "code")
  end

  test "rejects an unsupported photo format" do
    put "/api/v1/utterances/#{@utterance.id}/sneer_photo",
      params: {
        photo: uploaded_photo(content: "plain text", filename: "sneer.txt", content_type: "text/plain"),
        captured_at: Time.current.iso8601
      },
      headers: auth_headers(@user)

    assert_response :unprocessable_entity
    assert_equal "invalid_photo", response.parsed_body.dig("error", "code")
    assert_not @utterance.reload.sneer_photo.attached?
  end

  test "deletes the current user's photo and capture time" do
    put_photo(@utterance, @user, Time.current)
    blob_id = @utterance.reload.sneer_photo.blob_id

    delete "/api/v1/utterances/#{@utterance.id}/sneer_photo", headers: auth_headers(@user)

    assert_response :no_content
    @utterance.reload
    assert_not @utterance.sneer_photo.attached?
    assert_nil @utterance.snapshot_captured_at
    assert_not ActiveStorage::Blob.exists?(blob_id)
  end

  test "rejects deleting another user's photo" do
    put_photo(@utterance, @user, Time.current)

    delete "/api/v1/utterances/#{@utterance.id}/sneer_photo", headers: auth_headers(@other_user)

    assert_response :forbidden
    assert @utterance.reload.sneer_photo.attached?
  end

  private

  def create_utterance(user:, sneer_detected:)
    Utterance.create!(
      room: @room,
      user: user,
      transcript: "冷笑テスト発話",
      spoken_at: Time.current,
      duration_ms: 1_000,
      sneer_detected: sneer_detected,
      cringe_score: sneer_detected ? 80 : 0
    )
  end

  def put_photo(utterance, user, captured_at)
    put "/api/v1/utterances/#{utterance.id}/sneer_photo",
      params: { photo: uploaded_photo, captured_at: captured_at.iso8601 },
      headers: auth_headers(user)
  end

  def uploaded_photo(content: WEBP_DATA, filename: "sneer.webp", content_type: "image/webp")
    Rack::Test::UploadedFile.new(
      StringIO.new(content),
      content_type,
      true,
      original_filename: filename
    )
  end

  def auth_headers(user)
    { "Authorization" => "Bearer #{user.device_token}" }
  end
end
