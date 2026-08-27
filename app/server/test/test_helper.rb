ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module SingletonMethodStubbing
  def stub_singleton_method(target, method_name, replacement)
    singleton_class = target.singleton_class
    directly_defined = singleton_method_defined?(singleton_class, method_name)
    original_method = target.method(method_name) if directly_defined
    original_visibility = method_visibility(singleton_class, method_name)

    singleton_class.define_method(method_name) do |*args, **kwargs, &block|
      replacement.respond_to?(:call) ? replacement.call(*args, **kwargs, &block) : replacement
    end

    yield
  ensure
    if directly_defined
      singleton_class.define_method(method_name, original_method)
      singleton_class.send(original_visibility, method_name)
    else
      singleton_class.remove_method(method_name)
    end
  end

  private

  def singleton_method_defined?(singleton_class, method_name)
    singleton_class.public_instance_methods(false).include?(method_name) ||
      singleton_class.protected_instance_methods(false).include?(method_name) ||
      singleton_class.private_instance_methods(false).include?(method_name)
  end

  def method_visibility(singleton_class, method_name)
    return :private if singleton_class.private_method_defined?(method_name)
    return :protected if singleton_class.protected_method_defined?(method_name)

    :public
  end
end

module ActiveSupport
  class TestCase
    include SingletonMethodStubbing

    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
  end
end
