require "net/http"

class WhisperTranscriber
  ENDPOINT = URI("https://api.openai.com/v1/audio/transcriptions")

  def self.transcribe(audio_bytes, filename:, content_type:)
    boundary = SecureRandom.hex(16)
    body = build_body(boundary, audio_bytes, filename, content_type)

    request = Net::HTTP::Post.new(ENDPOINT)
    request["Authorization"] = "Bearer #{ENV.fetch('OPENAI_API_KEY')}"
    request["Content-Type"] = "multipart/form-data; boundary=#{boundary}"
    request.body = body

    response = Net::HTTP.start(ENDPOINT.host, ENDPOINT.port, use_ssl: true) do |http|
      http.request(request)
    end

    unless response.is_a?(Net::HTTPSuccess)
      raise "Whisper API error: #{response.code} #{response.body}"
    end

    JSON.parse(response.body)["text"].to_s.strip
  end

  def self.build_body(boundary, audio_bytes, filename, content_type)
    parts = []
    parts << text_part(boundary, "model", "whisper-1")
    parts << text_part(boundary, "language", "ja")
    parts << file_part(boundary, "file", filename, content_type, audio_bytes)
    parts << "--#{boundary}--\r\n"
    parts.join
  end
  private_class_method :build_body

  def self.text_part(boundary, name, value)
    "--#{boundary}\r\nContent-Disposition: form-data; name=\"#{name}\"\r\n\r\n#{value}\r\n"
  end
  private_class_method :text_part

  def self.file_part(boundary, name, filename, content_type, bytes)
    "--#{boundary}\r\n" \
      "Content-Disposition: form-data; name=\"#{name}\"; filename=\"#{filename}\"\r\n" \
      "Content-Type: #{content_type}\r\n\r\n#{bytes}\r\n"
  end
  private_class_method :file_part
end
