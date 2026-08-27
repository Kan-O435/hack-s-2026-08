class ApplicationController < ActionController::API
  include Authenticatable
  include ActiveStorage::SetCurrent

  PHOTO_URL_EXPIRES_IN = 5.minutes

  private

  def render_error(code, message, status)
    render json: { error: { code: code, message: message } }, status: status
  end

  def expiring_photo_url(attachment)
    attachment.blob.url(expires_in: PHOTO_URL_EXPIRES_IN, disposition: :inline)
  end
end
