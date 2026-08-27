module Authenticatable
  extend ActiveSupport::Concern

  included do
    attr_reader :current_user
  end

  private

  def authenticate_user!
    token = request.headers["Authorization"]&.delete_prefix("Bearer ")
    @current_user = User.find_by(device_token: token)

    return if @current_user

    render json: { error: { code: "unauthorized", message: "認証が必要です" } }, status: :unauthorized
  end
end
