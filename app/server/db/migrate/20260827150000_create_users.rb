class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :nickname, null: false
      t.string :device_token, null: false

      t.timestamps
    end

    add_index :users, :device_token, unique: true
  end
end
